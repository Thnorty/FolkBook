import io
import json
import zipfile
from io import BytesIO

import pytest
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from PIL import Image

from access.policy import Access
from core.api import Conflict
from exports import restore, services
from exports.schemas import Birthday, ExportFile
from people import photos
from people.models import Person, Tag
from relationships.models import DIRECTIONAL_TYPES, Relationship
from reminders.models import ReminderSettings
from spaces.models import Space
from tests.factories import (
    ContactMethodFactory,
    InteractionFactory,
    KeepInTouchFactory,
    MemoryAidFactory,
    NoteFactory,
    PersonFactory,
    RelationshipFactory,
    SpaceFactory,
    TagFactory,
    UserFactory,
)


def photo_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (800, 1000), (200, 80, 60)).save(buffer, "WEBP")
    return buffer.getvalue()


def zip_of(export: ExportFile, files: dict[str, bytes] | None = None) -> SimpleUploadedFile:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr("folkbook.json", export.model_dump_json())
        for path, content in (files or {}).items():
            archive.writestr(path, content)
    return SimpleUploadedFile("folkbook.zip", out.getvalue(), content_type="application/zip")


def export_zip_of(user) -> SimpleUploadedFile:
    export, photo_files = services.build(Access.for_user(user))
    out = io.BytesIO()
    services.write_zip(export, photo_files, out)
    return SimpleUploadedFile("folkbook.zip", out.getvalue(), content_type="application/zip")


def export_of(user) -> ExportFile:
    export, _ = services.build(Access.for_user(user))
    return export


def restore_into(user, upload, email=None):
    return restore.restore(Access.for_user(user), upload, email or user.email)


def readable(export: ExportFile) -> dict:
    """The export with ids replaced by names, to compare two books."""
    name = {person.id: person.name for person in export.people}
    space = {item.id: item.name for item in export.spaces}

    def without(model, *fields):
        return model.model_dump(exclude=set(fields))

    def by_person(rows, *extra):
        return sorted(
            ({**without(row, "person", *extra), "person": name[row.person]} for row in rows),
            key=repr,
        )

    return {
        "people": sorted(
            (without(p, "id", "photo", "kept", "shared") for p in export.people),
            key=lambda p: p["name"],
        ),
        "spaces": sorted(
            (
                {**without(s, "id", "people"), "people": sorted(name[p] for p in s.people)}
                for s in export.spaces
            ),
            key=lambda s: s["name"],
        ),
        "links": sorted(
            (
                {
                    **without(link, "person_a", "person_b", "space"),
                    # Symmetric links are stored lowest id first, and ids change.
                    "ends": ends if link.type in DIRECTIONAL_TYPES else tuple(sorted(ends)),
                    "space": space.get(link.space),
                }
                for link in export.links
                for ends in [(name[link.person_a], name[link.person_b])]
            ),
            key=repr,
        ),
        "notes": by_person(export.notes),
        "memory_aids": by_person(export.memory_aids),
        "timeline": by_person(export.timeline),
        "keep_in_touch": by_person(export.keep_in_touch),
        "reminder_settings": export.reminder_settings,
    }


@pytest.fixture
def newcomer(db):
    """A fresh account, as on a new server: nothing in the book but Me."""
    return UserFactory(email="ela@new.example.com", name="Ela")


@pytest.fixture
def rich_book(world):
    """Ela's book with a bit of everything in it."""
    ela = world.ela
    world.emma.birth_day, world.emma.birth_month, world.emma.pronouns = 14, 6, "she"
    world.emma.save()
    world.emma.tags.add(TagFactory(owner=ela, name="uni"), TagFactory(owner=ela, name="Ankara"))
    world.oskar.tags.add(Tag.objects.get(owner=ela, name="uni"))
    ContactMethodFactory(person=world.emma, kind="email", label="work", value="emma@example.com")
    ContactMethodFactory(person=world.emma, kind="phone", value="+90 555 000 00 00")
    world.oskar.photo.save("oskar.webp", ContentFile(photo_bytes()))
    world.oskar.photo_caption = "Oskar at the wall"
    world.oskar.save()
    ela.me.work = "Climbing coach"
    ela.me.save()
    MemoryAidFactory(author=ela, person=world.emma, text="Kid: Arda", pinned=True)
    InteractionFactory(author=ela, person=world.emma, kind="custom", label="Wedding")
    KeepInTouchFactory(user=ela, person=world.emma, interval_days=30, stopped=True)
    ReminderSettings.objects.create(user=ela, nudges_on=False, default_interval_days=14)
    RelationshipFactory(owner=ela, person_a=ela.me, person_b=world.emma, type="sibling")
    RelationshipFactory(
        owner=ela, person_a=ela.me, person_b=world.oskar, type="parent", parent_type="step"
    )
    NoteFactory(author=ela, person=world.tom, body="Ela: Tom plays bass.")
    return world


# ---------------------------------------------------------------- what comes back


def test_a_restored_book_exports_the_same_again(rich_book, newcomer):
    before = export_of(rich_book.ela)

    restore_into(newcomer, export_zip_of(rich_book.ela))

    after = readable(export_of(newcomer))
    expected = readable(before)
    # Tom was Defne's: he comes back as Ela's own kept copy, with what she wrote.
    assert after == expected
    assert export_of(newcomer).account.email == "ela@new.example.com"


def test_your_me_takes_the_exported_details(rich_book, newcomer):
    me = newcomer.me

    restore_into(newcomer, export_zip_of(rich_book.ela))

    me.refresh_from_db()
    assert (me.account, me.name, me.work) == (newcomer, "Ela", "Climbing coach")
    assert Person.objects.filter(account=newcomer).count() == 1


def test_someone_elses_person_comes_back_as_your_kept_copy(rich_book, newcomer):
    restore_into(newcomer, export_zip_of(rich_book.ela))

    tom = Person.objects.get(owner=newcomer, name="Tom")
    assert tom.kept_at is not None
    assert (tom.kept_from, tom.kept_space) == ("Defne", "Hackathon 2026")
    assert rich_book.tom.owner == rich_book.defne  # Defne's Tom is untouched


def test_kept_copies_stay_kept(world, newcomer):
    world.emma.kept_from, world.emma.kept_space = "Defne", "Hackathon 2026"
    world.emma.kept_at = world.emma.created_at
    world.emma.save()

    restore_into(newcomer, export_zip_of(world.ela))

    emma = Person.objects.get(owner=newcomer, name="Emma")
    assert (emma.kept_at, emma.kept_from, emma.kept_space) == (
        world.emma.created_at,
        "Defne",
        "Hackathon 2026",
    )


def test_photos_come_back_with_a_thumbnail(rich_book, newcomer):
    restore_into(newcomer, export_zip_of(rich_book.ela))

    oskar = Person.objects.get(owner=newcomer, name="Oskar")
    with default_storage.open(oskar.photo_thumbnail.name) as thumbnail:
        assert Image.open(thumbnail).size == photos.THUMBNAIL_SIZE
    assert oskar.photo.name != rich_book.oskar.photo.name


def test_dates_are_kept(rich_book, newcomer):
    restore_into(newcomer, export_zip_of(rich_book.ela))

    emma = Person.objects.get(owner=newcomer, name="Emma")
    assert emma.created_at == rich_book.emma.created_at


def test_the_summary_says_whose_book_it_is(rich_book, newcomer):
    summary = restore_into(newcomer, export_zip_of(rich_book.ela))

    assert (summary.name, summary.email) == ("Ela", "ela@example.com")
    assert (summary.people, summary.spaces, summary.photos) == (5, 1, 1)


# ---------------------------------------------------------------- replacing


def test_replaces_everything_in_your_book(world, newcomer, django_capture_on_commit_callbacks):
    me = newcomer.me
    old = PersonFactory(owner=newcomer, name="Old friend")
    old.photo.save("old.webp", ContentFile(photo_bytes()))
    old.save()
    old_photo = old.photo.name
    TagFactory(owner=newcomer, name="old tag")
    SpaceFactory(owner=newcomer, name="Old space")
    NoteFactory(author=newcomer, person=me, body="About me")
    ContactMethodFactory(person=me, value="+1 000")
    RelationshipFactory(owner=newcomer, person_a=me, person_b=old)

    with django_capture_on_commit_callbacks(execute=True):
        restore_into(newcomer, export_zip_of(world.ela))

    assert set(Person.objects.filter(owner=newcomer).values_list("name", flat=True)) == {
        "Ela",
        "Emma",
        "Oskar",
        "Ines",
    }
    assert Person.objects.get(account=newcomer).pk == me.pk
    assert list(Space.objects.filter(owner=newcomer).values_list("name", flat=True)) == [
        "Climbing club"
    ]
    assert not Tag.objects.filter(owner=newcomer, name="old tag").exists()
    assert export_of(newcomer).notes[0].body == "Ela: Oskar sets the Tuesday routes."
    assert not me.contact_methods.exists()
    assert not default_storage.exists(old_photo)


def test_other_books_are_untouched(world, newcomer):
    people = Person.objects.exclude(owner=newcomer).count()
    links = Relationship.objects.exclude(owner=newcomer).count()

    restore_into(newcomer, export_zip_of(world.ela))

    assert Person.objects.exclude(owner=newcomer).count() == people
    assert Relationship.objects.exclude(owner=newcomer).count() == links
    assert export_of(world.ela).people  # Ela still has her book


# ---------------------------------------------------------------- refusals


def test_refused_while_you_share_a_space(world):
    upload = export_zip_of(world.ela)

    with pytest.raises(Conflict):
        restore_into(world.ela, upload)  # Ela owns Climbing club, shared with Deniz
    with pytest.raises(Conflict):
        restore_into(world.deniz, upload)  # Deniz is a member of it
    with pytest.raises(Conflict):
        restore.check(Access.for_user(world.deniz), upload)


def test_refused_with_the_wrong_email(world, newcomer):
    with pytest.raises(ValidationError, match="your email"):
        restore_into(newcomer, export_zip_of(world.ela), email="ela@example.com")

    assert Person.objects.filter(owner=newcomer).count() == 1


def test_your_email_ignores_case_and_spaces(world, newcomer):
    restore_into(newcomer, export_zip_of(world.ela), email=" Ela@New.Example.com ")

    assert Person.objects.filter(owner=newcomer).count() == 4


@pytest.mark.parametrize(
    "limits",
    [
        {"include_private": False},
        {"include_private": True, "read_only": True},
        {"include_private": True, "read_only": False, "space_ids": []},
    ],
)
def test_limited_access_cant_restore(world, newcomer, limits):
    access = Access.limited(newcomer, **limits)

    with pytest.raises(PermissionDenied):
        restore.restore(access, export_zip_of(world.ela), newcomer.email)


@pytest.mark.parametrize(
    ("make_file", "message"),
    [
        (lambda e: SimpleUploadedFile("a.zip", b"not a zip"), "isn't a FolkBook export"),
        (
            lambda e: SimpleUploadedFile("a.zip", zip_bytes({"other.txt": b"hi"})),
            "isn't a FolkBook export",
        ),
        (
            lambda e: SimpleUploadedFile("a.zip", zip_bytes({"folkbook.json": b"{oops"})),
            "isn't a FolkBook export",
        ),
        (
            lambda e: SimpleUploadedFile(
                "a.zip", zip_bytes({"folkbook.json": json.dumps({"format": "x"}).encode()})
            ),
            "isn't a FolkBook export",
        ),
        (
            lambda e: SimpleUploadedFile(
                "a.zip",
                zip_bytes(
                    {"folkbook.json": json.dumps({"format": "folkbook", "version": 2}).encode()}
                ),
            ),
            "newer version of FolkBook",
        ),
        (
            lambda e: SimpleUploadedFile(
                "a.zip",
                zip_bytes(
                    {"folkbook.json": json.dumps({"format": "folkbook", "version": 1}).encode()}
                ),
            ),
            "damaged",
        ),
    ],
)
def test_files_that_arent_exports(world, newcomer, make_file, message):
    with pytest.raises(ValidationError, match=message):
        restore_into(newcomer, make_file(export_of(world.ela)))


def test_a_copy_of_one_person_isnt_a_book_to_restore(world, newcomer):
    export, _ = services.build(Access.for_user(world.ela), world.oskar)

    with pytest.raises(ValidationError, match="copy of one person"):
        restore.check(Access.for_user(newcomer), zip_of(export))


def zip_bytes(files: dict[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return out.getvalue()


def with_unknown_person_in_a_space(export):
    export.spaces[0].people.append(export.spaces[0].id)


def with_unknown_space_on_a_link(export):
    export.links[0].space = export.people[0].id


def with_a_link_to_yourself(export):
    export.links[0].person_b = export.links[0].person_a


def with_a_missing_photo(export):
    export.people[1].photo = "photos/nobody.webp"


def with_an_impossible_birthday(export):
    export.people[1].birthday = Birthday(day=31, month=2, year=None)


def with_an_unknown_link_type(export):
    export.links[0].type = "nemesis"


def with_two_mes(export):
    export.people[1].is_me = True


def with_a_note_on_nobody(export):
    export.notes[0].person = export.spaces[0].id


@pytest.mark.parametrize(
    "spoil",
    [
        with_unknown_person_in_a_space,
        with_unknown_space_on_a_link,
        with_a_link_to_yourself,
        with_a_missing_photo,
        with_an_impossible_birthday,
        with_an_unknown_link_type,
        with_two_mes,
        with_a_note_on_nobody,
    ],
)
def test_a_damaged_export_changes_nothing(world, newcomer, spoil):
    keep = PersonFactory(owner=newcomer, name="Still here")
    export = export_of(world.ela)
    spoil(export)

    with pytest.raises(ValidationError, match="damaged"):
        restore_into(newcomer, zip_of(export))

    assert Person.objects.filter(owner=newcomer, pk=keep.pk).exists()


def test_a_broken_photo_changes_nothing_and_leaves_no_files(world, newcomer, settings):
    world.ines.photo.save("ines.webp", ContentFile(photo_bytes()))
    world.ines.save()
    export, _ = services.build(Access.for_user(world.ela))
    ines = next(p for p in export.people if p.name == "Ines")
    # Oskar's photo is fine and gets stored first; Ines's can't be read.
    oskar = next(p for p in export.people if p.name == "Oskar")
    oskar.photo = "photos/oskar.webp"
    upload = zip_of(export, {oskar.photo: photo_bytes(), ines.photo: b"not a photo"})
    stored_before = stored_files(settings)

    with pytest.raises(ValidationError, match="Ines"):
        restore_into(newcomer, upload)

    assert Person.objects.filter(owner=newcomer).count() == 1
    assert stored_files(settings) == stored_before


def stored_files(settings) -> list[str]:
    return sorted(p.name for p in (settings.MEDIA_ROOT / "photos").rglob("*") if p.is_file())


def test_oversized_files_inside_the_zip_are_refused(world, newcomer, monkeypatch):
    monkeypatch.setattr(restore, "MAX_JSON_BYTES", 100)

    with pytest.raises(ValidationError, match="too big"):
        restore_into(newcomer, export_zip_of(world.ela))


def test_oversized_photos_are_refused(rich_book, newcomer, monkeypatch):
    monkeypatch.setattr(photos, "MAX_BYTES", 100)

    with pytest.raises(ValidationError, match="Oskar"):
        restore_into(newcomer, export_zip_of(rich_book.ela))


# ---------------------------------------------------------------- the API


def test_check_shows_whats_in_the_file_and_changes_nothing(api, world, newcomer):
    response = api.login(newcomer).upload(
        "/export/restore/check", {"file": export_zip_of(world.ela)}
    )

    assert response.status_code == 200
    assert response.json()["people"] == 4
    assert response.json()["email"] == "ela@example.com"
    assert Person.objects.filter(owner=newcomer).count() == 1


def test_restore_over_the_api(api, world, newcomer):
    response = api.login(newcomer).upload(
        "/export/restore",
        {"file": export_zip_of(world.ela), "confirm_email": newcomer.email},
    )

    assert response.status_code == 200
    assert response.json()["people"] == 4
    assert Person.objects.filter(owner=newcomer).count() == 4


@pytest.mark.parametrize(
    ("who", "email", "status"),
    [
        ("ela", "ela@example.com", 409),  # shares a space
        ("newcomer", "someone@example.com", 422),  # not their email
    ],
)
def test_restore_errors_over_the_api(api, world, newcomer, who, email, status):
    user = newcomer if who == "newcomer" else world.ela

    response = api.login(user).upload(
        "/export/restore", {"file": export_zip_of(world.ela), "confirm_email": email}
    )

    assert response.status_code == status
    assert "detail" in response.json()


def test_a_damaged_file_over_the_api_says_why(api, newcomer):
    response = api.login(newcomer).upload(
        "/export/restore/check", {"file": SimpleUploadedFile("a.zip", b"nope")}
    )

    assert response.status_code == 422
    assert "isn't a FolkBook export" in response.json()["detail"][0]["msg"]


def test_restore_needs_a_login(api, world):
    upload = export_zip_of(world.ela)

    assert api.upload("/export/restore/check", {"file": upload}).status_code == 401


def test_query_count_does_not_grow_with_the_book(rich_book, newcomer):
    world = rich_book

    def queries():
        # Restore once first, so each measured restore replaces a book like the one it
        # brings back.
        restore_into(newcomer, export_zip_of(world.ela))
        upload = export_zip_of(world.ela)
        with CaptureQueriesContext(connection) as captured:
            restore_into(newcomer, upload)
        return len(captured)

    before = queries()
    for _ in range(10):
        person = PersonFactory(owner=world.ela)
        person.tags.add(TagFactory(owner=world.ela))
        ContactMethodFactory(person=person)
        world.climbing.people.add(person)
        NoteFactory(author=world.ela, person=person)
        MemoryAidFactory(author=world.ela, person=person)
        InteractionFactory(author=world.ela, person=person)
        KeepInTouchFactory(user=world.ela, person=person)
        RelationshipFactory(owner=world.ela, person_a=person, person_b=world.oskar)

    assert queries() == before
