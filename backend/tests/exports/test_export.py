import io
import json
import zipfile

import pytest
from django.core.exceptions import PermissionDenied
from django.core.files.base import ContentFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from access.policy import Access
from exports import services
from exports.schemas import ExportFile
from people.models import HiddenPerson
from tests.factories import (
    ContactMethodFactory,
    MemoryAidFactory,
    NoteFactory,
    PersonFactory,
    RelationshipFactory,
    SpaceFactory,
    TagFactory,
)


def export_of(user) -> ExportFile:
    export, _ = services.build(Access.for_user(user))
    return export


def names(export: ExportFile) -> set[str]:
    return {person.name for person in export.people}


def by_name(export: ExportFile, name: str):
    return next(person for person in export.people if person.name == name)


# ---------------------------------------------------------------- who's in it


def test_your_own_book_with_your_me(world):
    export = export_of(world.ela)

    assert names(export) == {"Ela", "Emma", "Oskar", "Ines"}
    assert by_name(export, "Ela").is_me
    assert by_name(export, "Oskar").shared is None
    assert export.account.email == "ela@example.com"


def test_shared_people_only_when_you_wrote_about_them(world):
    assert "Tom" not in names(export_of(world.ela))  # shared with Ela, but she wrote nothing

    NoteFactory(author=world.ela, person=world.tom, body="Ela: Tom plays bass.")
    tom = by_name(export_of(world.ela), "Tom")

    assert tom.shared.owner == "Defne"
    assert tom.shared.spaces == ["Hackathon 2026"]


def test_people_you_linked_to_come_along(world):
    RelationshipFactory(owner=world.ela, person_a=world.emma, person_b=world.tom)

    assert "Tom" in names(export_of(world.ela))


def test_torn_out_and_removed_people_stay_out(world):
    NoteFactory(author=world.ela, person=world.tom)
    HiddenPerson.objects.create(user=world.ela, person=world.tom)
    world.emma.deleted_at = timezone.now()
    world.emma.save()

    assert names(export_of(world.ela)) == {"Ela", "Oskar", "Ines"}


# ---------------------------------------------------------------- privacy


def test_only_your_own_private_data(world):
    export = export_of(world.ela)

    assert [note.body for note in export.notes] == ["Ela: Oskar sets the Tuesday routes."]
    assert len(export.memory_aids) == len(export.timeline) == len(export.keep_in_touch) == 1


def test_a_member_gets_their_notes_and_never_the_owners(world):
    export = export_of(world.deniz)

    assert [note.body for note in export.notes] == ["Deniz: owes me a belay."]
    assert by_name(export, "Oskar").shared.owner == "Ela"
    assert export.memory_aids == export.timeline == export.keep_in_touch == []


def test_contact_details_of_shared_people_only_if_the_space_shares_them(world):
    NoteFactory(author=world.deniz, person=world.ines)
    assert by_name(export_of(world.deniz), "Ines").contacts == []

    world.climbing.share_contact_details = True
    world.climbing.save()

    [phone] = by_name(export_of(world.deniz), "Ines").contacts
    assert phone.value == "+46 70 555 12 90"


def ends(link) -> tuple:
    return (link.person_a_id, link.person_b_id, link.type)


def test_only_your_own_links(world):
    NoteFactory(author=world.ela, person=world.tom)
    NoteFactory(author=world.ela, person=world.ola)
    exported = sorted((x.person_a, x.person_b, x.type) for x in export_of(world.ela).links)

    # Not Defne's Tom–Ola, though Ela sees both of them now.
    assert exported == sorted(
        ends(link)
        for link in [world.emma_oskar_private, world.oskar_ines, world.oskar_emma_in_climbing]
    )


def test_links_in_someone_elses_space_come_along_as_private(world):
    link = RelationshipFactory(
        owner=world.deniz, person_a=world.oskar, person_b=world.ines, space=world.climbing
    )
    NoteFactory(author=world.deniz, person=world.ines)  # he wrote about Oskar already

    [exported] = export_of(world.deniz).links
    assert (exported.person_a, exported.person_b, exported.type) == ends(link)
    assert exported.space is None


def test_only_your_own_spaces(world):
    export = export_of(world.ela)

    [climbing] = export.spaces
    assert climbing.name == "Climbing club"
    assert set(climbing.people) == {world.oskar.pk, world.ines.pk}


# ---------------------------------------------------------------- details


def test_people_come_with_their_details(world):
    world.emma.birth_day, world.emma.birth_month = 14, 6
    world.emma.pronouns = "she"
    world.emma.save()
    world.emma.tags.add(TagFactory(owner=world.ela, name="uni"))
    ContactMethodFactory(person=world.emma, kind="email", value="emma@example.com")
    MemoryAidFactory(author=world.ela, person=world.emma, text="Kid: Arda", pinned=True)

    export = export_of(world.ela)
    emma = by_name(export, "Emma")

    assert (emma.birthday.day, emma.birthday.month, emma.birthday.year) == (14, 6, None)
    assert (emma.pronouns, emma.tags) == ("she", ["uni"])
    assert [c.value for c in emma.contacts] == ["emma@example.com"]
    [aid] = [aid for aid in export.memory_aids if aid.person == world.emma.pk]
    assert (aid.text, aid.pinned) == ("Kid: Arda", True)


def test_kept_copies_say_where_they_came_from(world):
    world.emma.kept_at = timezone.now()
    world.emma.kept_from, world.emma.kept_space = "Defne", "Hackathon 2026"
    world.emma.save()

    kept = by_name(export_of(world.ela), "Emma").kept
    assert (kept.owner, kept.space) == ("Defne", "Hackathon 2026")


# ---------------------------------------------------------------- the .zip


def test_the_zip_holds_the_json_and_the_photos(api, world):
    world.oskar.photo.save("oskar.webp", ContentFile(b"oskar's face"))

    response = api.login(world.ela).get("/export/everything")

    assert response.status_code == 200
    assert response["Content-Type"] == "application/zip"
    assert "attachment" in response["Content-Disposition"]
    archive = zipfile.ZipFile(io.BytesIO(b"".join(response.streaming_content)))
    export = ExportFile.model_validate(json.loads(archive.read("folkbook.json")))
    oskar = by_name(export, "Oskar")
    assert oskar.photo == f"photos/{world.oskar.pk}.webp"
    assert archive.read(oskar.photo) == b"oskar's face"
    assert "README.txt" in archive.namelist()


def test_the_summary_counts_people_and_photos(api, world):
    world.oskar.photo.save("oskar.webp", ContentFile(b"12345"))

    summary = api.login(world.ela).get("/export/summary").json()

    assert (summary["people"], summary["photos"]) == (4, 1)
    assert summary["size"] > 5


@pytest.mark.parametrize(
    "limits",
    [
        {"include_private": False},  # an API key without private notes
        {"include_private": True, "space_ids": "climbing"},  # one limited to some spaces
    ],
)
def test_limited_access_cant_export_everything(world, limits):
    if limits.get("space_ids"):
        limits = {**limits, "space_ids": [world.climbing.pk]}

    with pytest.raises(PermissionDenied):
        services.build(Access.limited(world.ela, **limits))


def test_export_needs_a_login(api):
    assert api.get("/export/everything").status_code == 401
    assert api.get("/export/summary").status_code == 401


def test_query_count_does_not_grow_with_the_book(world):
    def queries():
        with CaptureQueriesContext(connection) as captured:
            export_of(world.ela)
        return len(captured)

    before = queries()
    for _ in range(10):
        person = PersonFactory(owner=world.ela)
        person.tags.add(TagFactory(owner=world.ela))
        ContactMethodFactory(person=person)
        world.climbing.people.add(person)
        NoteFactory(author=world.ela, person=person)
        RelationshipFactory(owner=world.ela, person_a=person, person_b=world.oskar)

    assert queries() == before


# ---------------------------------------------------------------- a copy of one person


def copy_of(user, person) -> ExportFile:
    export, _ = services.build(Access.for_user(user), person)
    return export


def test_a_copy_of_one_person_holds_them_and_what_you_wrote(world):
    copy = copy_of(world.ela, world.oskar)

    assert copy.contents == "person"
    assert export_of(world.ela).contents == "everything"
    assert by_name(copy, "Oskar").shared is None
    assert [note.body for note in copy.notes] == ["Ela: Oskar sets the Tuesday routes."]
    assert len(copy.memory_aids) == len(copy.timeline) == len(copy.keep_in_touch) == 1


def test_the_people_they_are_linked_to_come_with_just_the_basics(world):
    world.emma.photo.save("emma.webp", ContentFile(b"emma's face"))
    world.emma.tags.add(TagFactory(owner=world.ela, name="uni"))
    NoteFactory(author=world.ela, person=world.emma, body="About Emma")
    MemoryAidFactory(author=world.ela, person=world.ines)

    export, photos = services.build(Access.for_user(world.ela), world.oskar)

    assert names(export) == {"Oskar", "Emma", "Ines"}  # not Ela: no link to her
    emma, ines = by_name(export, "Emma"), by_name(export, "Ines")
    assert (emma.photo, emma.tags, ines.contacts) == (None, [], [])
    assert photos == []
    assert {note.person for note in export.notes} == {world.oskar.pk}
    assert {aid.person for aid in export.memory_aids} == {world.oskar.pk}


def test_only_your_links_to_them(world):
    RelationshipFactory(owner=world.ela, person_a=world.emma, person_b=world.ines)
    RelationshipFactory(owner=world.deniz, person_a=world.oskar, person_b=world.yuki)

    links = copy_of(world.ela, world.oskar).links

    assert sorted(ends_of(link) for link in links) == sorted(
        ends(link)
        for link in [world.emma_oskar_private, world.oskar_ines, world.oskar_emma_in_climbing]
    )


def ends_of(link) -> tuple:
    return (link.person_a, link.person_b, link.type)


def test_only_the_spaces_they_are_in(world):
    other = SpaceFactory(owner=world.ela, name="Uni")
    other.people.add(world.emma)

    [climbing] = copy_of(world.ela, world.oskar).spaces

    assert climbing.name == "Climbing club"
    assert set(climbing.people) == {world.oskar.pk, world.ines.pk}


def test_a_copy_never_holds_anyone_elses_notes(world):
    copy = copy_of(world.deniz, world.oskar)  # Deniz sees Oskar through Climbing club

    assert [note.body for note in copy.notes] == ["Deniz: owes me a belay."]
    assert copy.memory_aids == copy.timeline == copy.keep_in_touch == []


def test_the_copy_downloads_as_a_zip_named_after_them(api, world):
    world.oskar.name = "Oskar Şen"
    world.oskar.save()
    world.oskar.photo.save("oskar.webp", ContentFile(b"oskar's face"))

    response = api.login(world.ela).get(f"/export/people/{world.oskar.pk}")

    assert response.status_code == 200
    assert "Oskar%20%C5%9Een" in response["Content-Disposition"]
    archive = zipfile.ZipFile(io.BytesIO(b"".join(response.streaming_content)))
    export = ExportFile.model_validate(json.loads(archive.read("folkbook.json")))
    assert export.contents == "person"
    assert archive.read(by_name(export, "Oskar Şen").photo) == b"oskar's face"
    assert "one person" in archive.read("README.txt").decode()


def test_someone_you_cant_see_is_not_found(api, world):
    assert api.login(world.sofia).get(f"/export/people/{world.oskar.pk}").status_code == 404


def test_limited_access_cant_copy_a_person(world):
    with pytest.raises(PermissionDenied):
        services.build(Access.limited(world.ela, include_private=False), world.oskar)
