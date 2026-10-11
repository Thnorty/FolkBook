"""Save: everything reviewed, at once, through the usual permission checks."""

import pytest

from capture.models import Capture
from interactions.models import Interaction
from people.models import MemoryAid, Person
from relationships.models import Relationship

pytestmark = pytest.mark.django_db


def counts() -> tuple[int, int, int, int]:
    return (
        Person.objects.count(),
        Relationship.objects.count(),
        MemoryAid.objects.count(),
        Interaction.objects.count(),
    )


def test_saves_everything_at_once(api, world, tom_and_emma):
    client = api.login(world.ela)

    response = client.post("/capture/save", tom_and_emma)

    assert response.status_code == 201
    saved = response.json()
    assert saved["added"] == {
        "people": 1,
        "connections": 1,
        "memory_aids": 1,
        "entries": 1,
        "changes": 1,
    }
    assert saved["matched"] == ["Emma"]
    tom = Person.objects.get(name="Tom Berg")
    assert saved["people"] == [
        {"id": str(tom.pk), "name": "Tom Berg", "new": True},
        {"id": str(world.emma.pk), "name": "Emma", "new": False},
    ]
    assert (tom.owner, tom.work, list(tom.tags.values_list("name", flat=True))) == (
        world.ela,
        "Designer at Spotify",
        ["climbing"],
    )
    assert list(tom.spaces.all()) == [world.climbing]
    world.emma.refresh_from_db()
    assert world.emma.work == "Spotify"
    assert MemoryAid.objects.get(person=tom, author=world.ela).text == "Likes climbing"
    # The entry counts as talking to Emma, as any timeline entry does.
    emma = client.get(f"/people/{world.emma.pk}").json()
    assert emma["last_talked_on"] == "2026-10-10"
    capture = Capture.objects.get(pk=saved["capture_id"])
    assert capture.owner == world.ela
    assert capture.changes == [
        {"person": str(world.emma.pk), "field": "work", "before": "Google", "after": "Spotify"}
    ]
    # Never the text the user wrote.
    assert {f.name for f in Capture._meta.get_fields()} == {
        "id",
        "created_at",
        "updated_at",
        "owner",
        "people",
        "relationships",
        "memory_aids",
        "interactions",
        "changes",
        "undone_at",
    }


def test_a_link_is_in_the_space_only_when_both_are(api, world, tom_and_emma):
    oskar = {"ref": "o", "person_id": str(world.oskar.pk)}
    tom_and_emma["existing_people"].append(oskar)
    tom_and_emma["connections"].append({"a": "t", "b": "o", "type": "friend"})

    api.login(world.ela).post("/capture/save", tom_and_emma)

    tom = Person.objects.get(name="Tom Berg")
    links = {link.type: link.space for link in Relationship.objects.filter(person_a=tom)} | {
        link.type: link.space for link in Relationship.objects.filter(person_b=tom)
    }
    # Emma isn't in Climbing club, so their link stays private; Oskar is.
    assert links == {"cousin": None, "friend": world.climbing}


def test_a_link_to_me(api, world):
    body = {
        "new_people": [{"ref": "t", "name": "Tom Berg"}],
        "connections": [{"a": "me", "b": "t", "type": "parent", "parent_type": "adoptive"}],
    }

    assert api.login(world.ela).post("/capture/save", body).status_code == 201

    link = Relationship.objects.get(owner=world.ela, type="parent", person_a=world.ela.me)
    assert (link.person_b.name, link.parent_type, link.space) == ("Tom Berg", "adoptive", None)


def test_nothing_is_saved_when_one_part_is_not_allowed(api, world, tom_and_emma):
    # Ela only views Hackathon 2026, where Defne's Tom is.
    tom_and_emma["existing_people"].append(
        {"ref": "x", "person_id": str(world.tom.pk), "changes": {"work": "Spotify"}}
    )
    before = counts()

    response = api.login(world.ela).post("/capture/save", tom_and_emma)

    assert response.status_code == 403
    assert counts() == before
    world.emma.refresh_from_db()
    assert world.emma.work == "Google"
    assert not Capture.objects.exists()


def test_someone_you_cannot_see_is_not_found(api, world, tom_and_emma):
    tom_and_emma["existing_people"].append({"ref": "j", "person_id": str(world.jin.pk)})
    before = counts()

    response = api.login(world.ela).post("/capture/save", tom_and_emma)

    assert response.status_code == 404
    assert counts() == before


def test_tags_only_from_the_owner(api, world):
    # Deniz edits Climbing club, so he may fix Ela's Oskar's details, but not his tags.
    body = {
        "existing_people": [
            {"ref": "o", "person_id": str(world.oskar.pk), "changes": {"add_tags": ["belay"]}}
        ]
    }

    assert api.login(world.deniz).post("/capture/save", body).status_code == 403


def test_tags_are_added_to_the_ones_they_have(api, world):
    world.emma.tags.create(owner=world.ela, name="family")
    body = {
        "existing_people": [
            {"ref": "e", "person_id": str(world.emma.pk), "changes": {"add_tags": ["climbing"]}}
        ]
    }

    saved = api.login(world.ela).post("/capture/save", body).json()

    assert sorted(world.emma.tags.values_list("name", flat=True)) == ["climbing", "family"]
    assert Capture.objects.get(pk=saved["capture_id"]).changes == [
        {
            "person": str(world.emma.pk),
            "field": "tags",
            "before": ["family"],
            "after": ["climbing", "family"],
        }
    ]


def test_unknown_refs_are_refused(api, world, tom_and_emma):
    tom_and_emma["connections"].append({"a": "t", "b": "x9", "type": "friend"})
    before = counts()

    response = api.login(world.ela).post("/capture/save", tom_and_emma)

    assert response.status_code == 422
    assert counts() == before


def test_a_space_you_cannot_add_to_is_refused(api, world, tom_and_emma):
    tom_and_emma["space_id"] = str(world.hackathon.pk)

    assert api.login(world.ela).post("/capture/save", tom_and_emma).status_code == 422
