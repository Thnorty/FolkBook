"""Kept copies: when access ends, you keep copies of the people you wrote about.

In the shared `world`: Climbing club is Ela's (Oskar, Ines), with Deniz as editor and
Kaan as viewer; Hackathon 2026 is Defne's (Tom, Ola), with Ela as viewer. Deniz has a
note on Oskar.
"""

import datetime

import pytest
from django.core.files.base import ContentFile
from django.utils import timezone

from people import services
from people.models import AccessEnded, Note, Person
from relationships.models import Relationship
from tests.factories import (
    InteractionFactory,
    MemoryAidFactory,
    NoteFactory,
    PersonFactory,
    RelationshipFactory,
)

pytestmark = pytest.mark.django_db


def copies_of(user) -> list[Person]:
    return list(Person.objects.filter(owner=user, kept_at__isnull=False).order_by("name"))


def names(response) -> set[str]:
    return {person["name"] for person in response.json()["items"]}


# ---------------------------------------------------------------- leaving


def test_leaving_keeps_a_copy_of_everyone_you_wrote_about(api, world):
    client = api.login(world.deniz)

    response = client.post(f"/spaces/{world.climbing.pk}/leave")

    assert response.status_code == 200
    [copy] = copies_of(world.deniz)
    assert response.json()["kept"] == [{"id": str(copy.pk), "name": "Oskar"}]
    assert (copy.kept_from, copy.kept_space) == ("Ela", "Climbing club")
    assert Note.objects.get(author=world.deniz).person == copy
    assert client.get(f"/people/{copy.pk}/note").json()["body"] == "Deniz: owes me a belay."
    assert names(client.get("/people")) == {"Deniz", "Yuki", "Oskar"}  # Ines and Ela went
    assert client.get(f"/people/{world.oskar.pk}").status_code == 404


def test_the_copy_is_yours_alone_and_marked_kept(api, world):
    api.login(world.deniz).post(f"/spaces/{world.climbing.pk}/leave")
    [copy] = copies_of(world.deniz)

    mine = api.login(world.deniz).get(f"/people/{copy.pk}").json()
    assert mine["kept"]["from_owner"] == "Ela"
    assert mine["kept"]["space"] == "Climbing club"
    assert mine["is_mine"] and mine["can_edit"]
    assert api.login(world.ela).get(f"/people/{copy.pk}").status_code == 404
    assert api.login(world.deniz).get("/people", kept=True).json()["items"][0]["id"] == str(copy.pk)


def test_a_copy_is_not_someone_you_recently_added(api, world):
    api.login(world.deniz).post(f"/spaces/{world.climbing.pk}/leave")

    assert names(api.login(world.deniz).get("/people", recent=True)) == {"Yuki"}


def test_nothing_changes_for_the_others(api, world):
    api.login(world.deniz).post(f"/spaces/{world.climbing.pk}/leave")

    ela = api.login(world.ela)
    assert ela.get(f"/people/{world.oskar.pk}").status_code == 200
    assert ela.get(f"/people/{world.oskar.pk}/note").json()["body"].startswith("Ela:")
    assert {m["name"] for m in ela.get(f"/spaces/{world.climbing.pk}/members").json()} == {
        "Ela",
        "Kaan",
    }
    assert not AccessEnded.objects.exists()  # nobody kept anything because of it


def test_your_own_people_leave_the_space_with_you(api, world):
    world.climbing.people.add(world.yuki)  # Deniz's
    NoteFactory(author=world.kaan, person=world.yuki, body="Kaan: Yuki climbs at 6.")

    api.login(world.deniz).post(f"/spaces/{world.climbing.pk}/leave")

    assert not world.climbing.people.filter(pk=world.yuki.pk).exists()
    [copy] = copies_of(world.kaan)  # Kaan wrote about Yuki
    notice = AccessEnded.objects.get(user=world.kaan)
    assert (notice.reason, notice.about, notice.space) == ("member_left", "Deniz", "Climbing club")
    assert list(notice.kept.all()) == [copy]


def test_the_preview_says_what_leaving_would_do_and_changes_nothing(api, world):
    MemoryAidFactory(author=world.deniz, person=world.oskar)
    MemoryAidFactory(author=world.deniz, person=world.oskar)
    InteractionFactory(author=world.deniz, person=world.oskar)
    world.climbing.people.add(world.yuki)

    response = api.login(world.deniz).get(f"/spaces/{world.climbing.pk}/leave-preview")

    assert response.status_code == 200
    assert response.json() == {
        "kept": [
            {
                "person": {"id": str(world.oskar.pk), "name": "Oskar"},
                "notes": 1,
                "memory_aids": 2,
                "interactions": 1,
            }
        ],
        "leaving": 3,  # Ines, Ela and Kaan
        "own_people": 1,  # Yuki
    }
    assert world.climbing.memberships.filter(user=world.deniz).exists()
    assert world.climbing.people.filter(pk=world.yuki.pk).exists()
    assert not copies_of(world.deniz)


@pytest.mark.parametrize(
    ("who", "status"),
    [("ela", 403), ("sofia", 404)],  # the owner deletes instead; strangers don't see it
)
def test_only_members_can_leave(api, world, who, status):
    client = api.login(getattr(world, who))

    assert client.post(f"/spaces/{world.climbing.pk}/leave").status_code == status
    assert client.get(f"/spaces/{world.climbing.pk}/leave-preview").status_code == status


# ---------------------------------------------------------------- the owner ends access


def test_the_owner_removes_a_member_who_is_told_and_keeps_copies(api, world):
    response = api.login(world.ela).delete(f"/spaces/{world.climbing.pk}/members/{world.deniz.pk}")

    assert response.status_code == 204
    assert not world.climbing.memberships.filter(user=world.deniz).exists()
    [copy] = copies_of(world.deniz)
    notice = AccessEnded.objects.get(user=world.deniz)
    assert (notice.reason, notice.by, notice.space) == ("removed", "Ela", "Climbing club")
    assert notice.lost_count == 4  # Oskar, Ines, Ela, Kaan
    assert list(notice.kept.all()) == [copy]
    assert not AccessEnded.objects.filter(user=world.kaan).exists()  # lost only Deniz's Me


@pytest.mark.parametrize("who", ["deniz", "kaan"])
def test_only_the_owner_removes_members(api, world, who):
    response = api.login(getattr(world, who)).delete(
        f"/spaces/{world.climbing.pk}/members/{world.kaan.pk}"
    )

    assert response.status_code == 403


def test_stopping_sharing_removes_every_member_and_tells_them(api, world):
    NoteFactory(author=world.ela, person=world.tom, body="Ela: Tom's moving to Istanbul.")

    response = api.login(world.defne).post(f"/spaces/{world.hackathon.pk}/stop-sharing")

    assert response.status_code == 204
    assert not world.hackathon.memberships.exists()
    [copy] = copies_of(world.ela)
    assert (copy.name, copy.kept_from, copy.kept_space) == ("Tom", "Defne", "Hackathon 2026")
    notice = AccessEnded.objects.get(user=world.ela)
    assert (notice.reason, notice.lost_count) == ("stopped_sharing", 3)  # Tom, Ola, Defne


def test_deleting_a_shared_space_tells_its_members(api, world):
    assert api.login(world.ela).delete(f"/spaces/{world.climbing.pk}").status_code == 204

    told = {(n.user, n.reason) for n in AccessEnded.objects.all()}
    assert told == {(world.deniz, "space_deleted"), (world.kaan, "space_deleted")}
    assert [copy.name for copy in copies_of(world.deniz)] == ["Oskar"]


def test_taking_someone_out_of_a_space_leaves_copies_for_who_wrote_about_them(api, world):
    response = api.login(world.ela).delete(f"/spaces/{world.climbing.pk}/people/{world.oskar.pk}")

    assert response.status_code == 204
    [copy] = copies_of(world.deniz)
    notice = AccessEnded.objects.get(user=world.deniz)
    assert (notice.reason, notice.about, notice.by) == ("person_removed", "Oskar", "Ela")
    assert not AccessEnded.objects.filter(user=world.kaan).exists()  # wrote nothing
    assert Person.objects.filter(pk=world.oskar.pk, owner=world.ela).exists()
    assert copy.kept_space == "Climbing club"


def test_someone_you_still_see_through_another_space_isnt_copied(api, world):
    other = world.climbing.__class__.objects.create(owner=world.ela, name="Gym")
    other.memberships.create(user=world.deniz)
    other.people.add(world.oskar)

    api.login(world.ela).delete(f"/spaces/{world.climbing.pk}/members/{world.deniz.pk}")

    assert not copies_of(world.deniz)
    assert Note.objects.get(author=world.deniz).person == world.oskar


# ---------------------------------------------------------------- what the copy holds


def test_the_copy_has_the_basic_profile_tags_and_photo(api, world):
    world.oskar.how_we_met = "Bouldergarten"
    world.oskar.birth_day, world.oskar.birth_month = 14, 6
    world.oskar.pronouns = "he"
    world.oskar.photo.save("oskar.webp", ContentFile(b"full"), save=False)
    world.oskar.photo_thumbnail.save("oskar-thumbnail.webp", ContentFile(b"small"), save=False)
    world.oskar.save()
    services.set_tags(world.oskar, ["climbing"])

    api.login(world.deniz).post(f"/spaces/{world.climbing.pk}/leave")

    [copy] = copies_of(world.deniz)
    assert (copy.how_we_met, copy.birth_day, copy.birth_month, copy.pronouns) == (
        "Bouldergarten",
        14,
        6,
        "he",
    )
    assert [tag.owner for tag in copy.tags.all()] == [world.deniz]
    assert copy.photo.name != world.oskar.photo.name
    assert copy.photo.read() == b"full"
    assert copy.photo_thumbnail.read() == b"small"


@pytest.mark.parametrize(("shared", "phones"), [(True, ["+46 70 555 12 90"]), (False, [])])
def test_contact_details_come_along_only_if_you_could_see_them(api, world, shared, phones):
    world.climbing.share_contact_details = shared
    world.climbing.save()
    NoteFactory(author=world.kaan, person=world.ines)

    api.login(world.kaan).post(f"/spaces/{world.climbing.pk}/leave")

    [copy] = copies_of(world.kaan)
    assert [method.value for method in copy.contact_methods.all()] == phones


def test_your_private_links_follow_the_copies_and_the_rest_go(api, world):
    kaans = PersonFactory(owner=world.kaan, name="Selin")
    NoteFactory(author=world.kaan, person=world.oskar)
    to_oskar = RelationshipFactory(owner=world.kaan, person_a=kaans, person_b=world.oskar)
    to_ines = RelationshipFactory(owner=world.kaan, person_a=kaans, person_b=world.ines)

    api.login(world.kaan).post(f"/spaces/{world.climbing.pk}/leave")

    [copy] = copies_of(world.kaan)
    to_oskar.refresh_from_db()
    assert {to_oskar.person_a, to_oskar.person_b} == {kaans, copy}
    assert not Relationship.objects.filter(pk=to_ines.pk).exists()  # Ines wasn't kept


def test_links_you_made_in_the_space_stay_with_the_space(api, world):
    in_space = RelationshipFactory(
        owner=world.deniz,
        person_a=world.oskar,
        person_b=world.ines,
        type="colleague",
        space=world.climbing,
    )

    api.login(world.deniz).post(f"/spaces/{world.climbing.pk}/leave")

    in_space.refresh_from_db()
    assert (in_space.owner, in_space.space) == (world.ela, world.climbing)
    names_seen = {
        link["type"] for link in api.login(world.kaan).get("/relationships").json()["items"]
    }
    assert "colleague" in names_seen


# ---------------------------------------------------------------- deleting someone


def test_others_keep_a_copy_when_the_owner_deletes_someone(api, world):
    api.login(world.ela).delete(f"/people/{world.oskar.pk}")
    later = timezone.now() + services.UNDO_WINDOW + datetime.timedelta(seconds=1)

    services.purge_deleted_people(now=later)

    assert not Person.objects.filter(pk=world.oskar.pk).exists()
    assert not copies_of(world.ela)  # the owner's own notes go
    [copy] = copies_of(world.deniz)
    assert (copy.kept_from, copy.kept_space) == ("Ela", "")
    assert Note.objects.get(author=world.deniz).person == copy
    notice = AccessEnded.objects.get(user=world.deniz)
    assert (notice.reason, notice.about) == ("person_deleted", "Oskar")


# ---------------------------------------------------------------- the Today card


def test_today_lists_what_ended_until_dismissed(api, world):
    api.login(world.ela).delete(f"/spaces/{world.climbing.pk}/members/{world.deniz.pk}")
    client = api.login(world.deniz)

    [notice] = client.get("/today/access-ended").json()
    assert notice["reason"] == "removed"
    assert (notice["by"], notice["space"], notice["lost"]) == ("Ela", "Climbing club", 4)
    assert [person["name"] for person in notice["kept"]] == ["Oskar"]

    assert client.delete(f"/today/access-ended/{notice['id']}").status_code == 204
    assert client.get("/today/access-ended").json() == []
    assert copies_of(world.deniz)  # the copies stay


def test_nobody_else_sees_or_dismisses_your_cards(api, world):
    api.login(world.ela).delete(f"/spaces/{world.climbing.pk}/members/{world.deniz.pk}")
    notice = AccessEnded.objects.get(user=world.deniz)

    ela = api.login(world.ela)
    assert ela.get("/today/access-ended").json() == []
    assert ela.delete(f"/today/access-ended/{notice.pk}").status_code == 404
