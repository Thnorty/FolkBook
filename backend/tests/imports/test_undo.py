"""Undoing an import: who goes, who stays, merges taken back, and bringing it all back."""

import datetime
import importlib

import pytest
from django.apps import apps
from django.core.exceptions import PermissionDenied
from django.core.files.storage import default_storage
from django.utils import timezone

from access.policy import Access, visible_imports
from core.api import Conflict
from imports import tasks, undo
from imports.models import Import, Merge
from people import services as people_services
from people.models import ContactMethod, Note, Person
from tests.factories import (
    InteractionFactory,
    KeepInTouchFactory,
    MemoryAidFactory,
    NoteFactory,
    RelationshipFactory,
)
from tests.imports.test_import import CHEN, GRETA, INES, LARS, jpeg, merge, new, run, vcard, vcf

count_earlier_imports = importlib.import_module(
    "imports.migrations.0003_import_counts_and_taken_back"
).count_earlier_imports

LATER = people_services.UNDO_WINDOW + datetime.timedelta(seconds=1)
AGO = datetime.timedelta(seconds=10)


@pytest.fixture
def imported(api, world, monkeypatch):
    """Import as Ela, a little while ago: what she writes after it then comes later even
    on a coarse clock."""

    def run_it(*cards: str, picked: list[dict], space=None) -> Import:
        real_now = timezone.now
        with monkeypatch.context() as patch:
            patch.setattr(timezone, "now", lambda: real_now() - AGO)
            response = run(api, world.ela, vcf(*cards), picked, space)
        assert response.status_code == 200
        return Import.objects.get(pk=response.json()["import_id"])

    return run_it


def person(name: str) -> Person:
    return Person.objects.get(name=name)


def names(people: list[dict]) -> list[str]:
    return [p["name"] for p in people]


def preview(api, world, batch):
    return api.login(world.ela).get(f"/imports/{batch.pk}/undo-preview").json()


def test_preview_says_who_goes_and_who_stays(api, world, imported):
    batch = imported(GRETA, LARS, CHEN, INES, picked=new(0, 1, 2) + merge(3, world.ines))
    MemoryAidFactory(author=world.ela, person=person("Greta Holm"))
    RelationshipFactory(owner=world.ela, person_a=world.emma, person_b=person("Lars Eriksen"))

    body = preview(api, world, batch)

    assert names(body["goes"]) == ["Chen Wei"]
    assert names(body["stays"]) == ["Greta Holm", "Lars Eriksen"]
    assert names(body["loses_details"]) == ["Ines"]


@pytest.mark.parametrize(
    "write",
    [
        lambda world, p: NoteFactory(author=world.ela, person=p),
        lambda world, p: InteractionFactory(author=world.ela, person=p),
        lambda world, p: KeepInTouchFactory(user=world.ela, person=p),
    ],
    ids=["note", "timeline", "keep in touch"],
)
def test_anything_written_since_keeps_them(api, world, write, imported):
    batch = imported(LARS, picked=new(0))
    write(world, person("Lars Eriksen"))

    assert names(preview(api, world, batch)["stays"]) == ["Lars Eriksen"]


def test_the_imports_own_notes_dont_count(api, world, imported):
    batch = imported(GRETA, picked=new(0))  # Greta's card has a note

    assert names(preview(api, world, batch)["goes"]) == ["Greta Holm"]


def test_an_edited_import_note_counts(api, world, imported):
    batch = imported(GRETA, picked=new(0))
    note = Note.objects.get(person=person("Greta Holm"))
    note.body += " Loves bouldering."
    note.save()

    assert names(preview(api, world, batch)["stays"]) == ["Greta Holm"]


def test_someone_else_writing_about_them_doesnt_count(api, world, imported):
    batch = imported(LARS, picked=new(0), space=world.climbing.pk)
    NoteFactory(author=world.deniz, person=person("Lars Eriksen"))

    assert names(preview(api, world, batch)["goes"]) == ["Lars Eriksen"]


def test_undo_deletes_like_tearing_out(api, world, imported):
    batch = imported(GRETA, LARS, picked=new(0, 1))
    MemoryAidFactory(author=world.ela, person=person("Lars Eriksen"))

    response = api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    assert response.status_code == 200
    assert response.json()["undone_at"] is not None
    assert person("Greta Holm").deleted_at is not None
    assert person("Lars Eriksen").deleted_at is None
    people_services.purge_deleted_people(now=timezone.now() + LATER)
    assert not Person.objects.filter(name="Greta Holm").exists()
    assert Person.objects.filter(name="Lars Eriksen").exists()


def test_undo_takes_back_merges(api, world, imported):
    NoteFactory(author=world.ela, person=world.ines, body="Climbs on Tuesdays")
    batch = imported(INES, picked=merge(0, world.ines))

    api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    world.ines.refresh_from_db()
    assert [m.value for m in world.ines.contact_methods.all()] == ["+46 70 555 12 90"]
    assert (world.ines.work, world.ines.birth_day, world.ines.birth_month) == ("", None, None)
    assert Note.objects.get(author=world.ela, person=world.ines).body == "Climbs on Tuesdays"
    record = Merge.objects.get(batch=batch)
    assert record.taken_back["work"] == "Doctor"
    assert record.taken_back["birthday"] == [2, 3, None]
    assert record.taken_back["note"] == "\n\nFrom the climbing gym"
    assert record.taken_back["contacts"] == [
        {"kind": "email", "label": "", "value": "ines@example.com", "position": 1}
    ]


def test_a_note_the_merge_started_goes(api, world, imported):
    batch = imported(vcard("Emma", "NOTE:Neighbour"), picked=merge(0, world.emma))

    api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    assert not Note.objects.filter(author=world.ela, person=world.emma).exists()


def test_a_merged_photo_is_taken_back_while_its_still_the_photo(api, world, imported):
    upload = vcard("Emma", f"PHOTO;ENCODING=b;TYPE=JPEG:{jpeg()}")
    batch = imported(upload, picked=merge(0, world.emma))
    world.emma.refresh_from_db()
    files = [world.emma.photo.name, world.emma.photo_thumbnail.name]

    api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    world.emma.refresh_from_db()
    assert not world.emma.photo and not world.emma.photo_thumbnail
    assert Merge.objects.get(batch=batch).taken_back["photo"] == files
    assert all(default_storage.exists(name) for name in files)  # until Undo runs out


def test_changed_since_stays(api, world, imported):
    batch = imported(INES, picked=merge(0, world.ines))
    world.ines.refresh_from_db()
    world.ines.work = "Surgeon"
    world.ines.save()
    note = Note.objects.get(author=world.ela, person=world.ines)
    note.body += "\n\nLikes long routes"
    note.save()

    api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    world.ines.refresh_from_db()
    assert world.ines.work == "Surgeon"
    assert world.ines.birth_day is None  # the birthday was still as imported
    assert note.body == Note.objects.get(pk=note.pk).body
    assert "work" not in Merge.objects.get(batch=batch).taken_back


def test_two_merges_into_one_person_are_taken_back(api, world, imported):
    NoteFactory(author=world.ela, person=world.emma, body="Neighbour")
    first = vcard("Emma", "TEL:+46 70 111 11 11", "NOTE:Plays chess")
    second = vcard("Emma", "EMAIL:emma@example.com", "NOTE:Has a cat")
    batch = imported(first, second, picked=merge(0, world.emma) + merge(1, world.emma))
    body = Note.objects.get(author=world.ela, person=world.emma).body
    assert body == "Neighbour\n\nPlays chess\n\nHas a cat"

    response = api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    assert response.status_code == 200
    assert not world.emma.contact_methods.exists()
    assert Note.objects.get(author=world.ela, person=world.emma).body == "Neighbour"

    api.login(world.ela).post(f"/imports/{batch.pk}/redo")

    assert sorted(m.value for m in world.emma.contact_methods.all()) == [
        "+46 70 111 11 11",
        "emma@example.com",
    ]
    assert Note.objects.get(author=world.ela, person=world.emma).body == body


def test_nobody_left_to_go(api, world, imported):
    batch = imported(LARS, INES, picked=new(0) + merge(1, world.ines))
    people_services.delete_person(Access.for_user(world.ela), person("Lars Eriksen"))

    body = preview(api, world, batch)
    api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    assert body["goes"] == [] and body["stays"] == []
    assert names(body["loses_details"]) == ["Ines"]
    assert not world.ines.contact_methods.filter(value="ines@example.com").exists()


def test_a_shared_imported_person_goes_like_any_delete(api, world, imported):
    batch = imported(LARS, picked=new(0), space=world.climbing.pk)
    NoteFactory(author=world.deniz, person=person("Lars Eriksen"), body="Belays well")

    api.login(world.ela).post(f"/imports/{batch.pk}/undo")
    people_services.purge_deleted_people(now=timezone.now() + LATER)

    [copy] = Person.objects.filter(owner=world.deniz, name="Lars Eriksen")
    assert copy.kept_from == "Ela"
    assert Note.objects.get(author=world.deniz, body="Belays well").person == copy


def test_redo_brings_everything_back(api, world, imported):
    NoteFactory(author=world.ela, person=world.ines, body="Climbs on Tuesdays")
    upload = vcard("Emma", f"PHOTO;ENCODING=b;TYPE=JPEG:{jpeg()}")
    batch = imported(
        GRETA, INES, upload, picked=new(0) + merge(1, world.ines) + merge(2, world.emma)
    )
    world.emma.refresh_from_db()
    photo = world.emma.photo.name
    client = api.login(world.ela)
    client.post(f"/imports/{batch.pk}/undo")

    response = client.post(f"/imports/{batch.pk}/redo")

    assert response.status_code == 200
    assert response.json()["undone_at"] is None
    assert person("Greta Holm").deleted_at is None
    world.ines.refresh_from_db()
    world.emma.refresh_from_db()
    assert (world.ines.work, world.ines.birth_day, world.ines.birth_month) == ("Doctor", 2, 3)
    added = world.ines.contact_methods.get(value="ines@example.com")
    assert added.added_by_import == batch
    assert Note.objects.get(author=world.ela, person=world.ines).body == (
        "Climbs on Tuesdays\n\nFrom the climbing gym"
    )
    assert world.emma.photo.name == photo
    assert not Merge.objects.filter(batch=batch, taken_back__isnull=False).exists()
    # And it can be undone again.
    assert client.post(f"/imports/{batch.pk}/undo").status_code == 200


def test_redo_leaves_people_deleted_by_hand(api, world, imported):
    batch = imported(GRETA, LARS, picked=new(0, 1))
    access = Access.for_user(world.ela)
    people_services.delete_person(access, person("Lars Eriksen"))
    Person.objects.filter(name="Lars Eriksen").update(
        deleted_at=timezone.now() - datetime.timedelta(seconds=5)
    )
    client = api.login(world.ela)
    client.post(f"/imports/{batch.pk}/undo")

    client.post(f"/imports/{batch.pk}/redo")

    assert person("Greta Holm").deleted_at is None
    assert person("Lars Eriksen").deleted_at is not None


def test_redo_too_late(api, world, imported):
    batch = imported(GRETA, INES, picked=new(0) + merge(1, world.ines))
    client = api.login(world.ela)
    client.post(f"/imports/{batch.pk}/undo")
    earlier = timezone.now() - datetime.timedelta(minutes=2)
    Import.objects.filter(pk=batch.pk).update(undone_at=earlier)
    Person.objects.filter(name="Greta Holm").update(deleted_at=earlier)

    response = client.post(f"/imports/{batch.pk}/redo")

    assert response.status_code == 409
    assert response.json() == {"detail": "It's too late to bring them back."}
    assert person("Greta Holm").deleted_at == earlier
    assert not world.ines.contact_methods.filter(value="ines@example.com").exists()
    assert Import.objects.get(pk=batch.pk).undone_at == earlier


def test_undoing_twice_is_409(api, world, imported):
    batch = imported(GRETA, picked=new(0))
    client = api.login(world.ela)
    client.post(f"/imports/{batch.pk}/undo")

    assert client.post(f"/imports/{batch.pk}/undo").status_code == 409


def test_redo_without_an_undo_is_409(api, world, imported):
    batch = imported(GRETA, picked=new(0))

    assert api.login(world.ela).post(f"/imports/{batch.pk}/redo").status_code == 409


def test_someone_elses_import_is_404(api, world, imported):
    batch = imported(GRETA, picked=new(0))
    client = api.login(world.deniz)

    assert client.get(f"/imports/{batch.pk}/undo-preview").status_code == 404
    assert client.post(f"/imports/{batch.pk}/undo").status_code == 404
    assert client.post(f"/imports/{batch.pk}/redo").status_code == 404
    assert person("Greta Holm").deleted_at is None


@pytest.mark.parametrize(
    "limits",
    [
        {"include_private": True, "read_only": True},
        {"include_private": False, "read_only": False},
    ],
    ids=["read-only", "without private notes"],
)
def test_limited_access_cant_undo(api, world, imported, limits):
    batch = imported(GRETA, picked=new(0))
    access = Access.limited(world.ela, **limits)

    with pytest.raises(PermissionDenied):
        undo.undo_import(access, batch)
    with pytest.raises(PermissionDenied):
        undo.redo_import(access, batch)
    with pytest.raises(PermissionDenied):
        undo.undo_preview(access, batch)
    assert person("Greta Holm").deleted_at is None


def test_space_limited_access_sees_no_imports(api, world, imported):
    imported(GRETA, picked=new(0))
    access = Access.limited(
        world.ela, space_ids=[world.climbing.pk], include_private=True, read_only=False
    )

    assert not visible_imports(access).exists()


def test_two_undos_at_once_leave_redo_working(api, world, imported):
    batch = imported(GRETA, INES, picked=new(0) + merge(1, world.ines))
    stale = Import.objects.get(pk=batch.pk)  # read by a second request before the first ends
    access = Access.for_user(world.ela)
    undo.undo_import(access, batch)

    with pytest.raises(Conflict):
        undo.undo_import(access, stale)

    undo.redo_import(access, Import.objects.get(pk=batch.pk))
    assert person("Greta Holm").deleted_at is None
    assert world.ines.contact_methods.filter(value="ines@example.com").exists()


def test_two_redos_at_once_put_back_once(api, world, imported):
    batch = imported(INES, picked=merge(0, world.ines))
    access = Access.for_user(world.ela)
    undo.undo_import(access, batch)
    stale = Import.objects.get(pk=batch.pk)
    undo.redo_import(access, Import.objects.get(pk=batch.pk))

    with pytest.raises(Conflict):
        undo.redo_import(access, stale)

    assert world.ines.contact_methods.filter(value="ines@example.com").count() == 1
    assert Note.objects.get(author=world.ela, person=world.ines).body == "From the climbing gym"


def test_a_taken_back_photo_goes_when_its_person_is_purged(
    api, world, imported, django_capture_on_commit_callbacks
):
    upload = vcard("Emma", f"PHOTO;ENCODING=b;TYPE=JPEG:{jpeg()}")
    batch = imported(upload, picked=merge(0, world.emma))
    world.emma.refresh_from_db()
    files = [world.emma.photo.name, world.emma.photo_thumbnail.name]
    api.login(world.ela).post(f"/imports/{batch.pk}/undo")
    people_services.delete_person(Access.for_user(world.ela), world.emma)

    with django_capture_on_commit_callbacks(execute=True):
        people_services.purge_deleted_people(now=timezone.now() + LATER)

    assert not any(default_storage.exists(name) for name in files)


def test_imports_made_before_finished_at_was_kept(api, world, imported):
    """Migration 0003 works out when earlier imports finished: their people and notes
    were written after the import row."""
    batch = imported(GRETA, LARS, INES, picked=new(0, 1) + merge(2, world.ines))
    Import.objects.filter(pk=batch.pk).update(finished_at=None, added=0, merged=0)
    # As PR 1 wrote them: the import row first, its people and notes a moment later.
    Import.objects.filter(pk=batch.pk).update(created_at=batch.created_at - AGO)

    count_earlier_imports(apps, None)

    batch.refresh_from_db()
    assert (batch.added, batch.merged) == (2, 1)
    assert names(preview(api, world, batch)["goes"]) == ["Greta Holm", "Lars Eriksen"]


def test_forget_taken_back_photos(api, world, imported):
    upload = vcard("Emma", f"PHOTO;ENCODING=b;TYPE=JPEG:{jpeg()}")
    batch = imported(upload, picked=merge(0, world.emma))
    world.emma.refresh_from_db()
    files = [world.emma.photo.name, world.emma.photo_thumbnail.name]
    api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    assert undo.forget_taken_back_photos() == 0  # Undo can still bring it back
    assert undo.forget_taken_back_photos(now=timezone.now() + LATER) == 1
    assert not any(default_storage.exists(name) for name in files)
    assert "photo" not in Merge.objects.get(batch=batch).taken_back
    assert undo.forget_taken_back_photos(now=timezone.now() + LATER) == 0


def test_the_photo_job_runs(world):
    assert tasks.forget_taken_back_photos.call() == 0


def test_query_count_of_the_preview_does_not_grow(api, world, imported):
    from django.db import connection
    from django.test.utils import CaptureQueriesContext

    def queries(batch) -> int:
        with CaptureQueriesContext(connection) as captured:
            preview(api, world, batch)
        return len(captured)

    small = imported(GRETA, picked=new(0))
    big = imported(GRETA, LARS, CHEN, picked=new(0, 1, 2))

    assert queries(big) == queries(small)


def test_contact_method_is_kept_when_edited(api, world, imported):
    batch = imported(INES, picked=merge(0, world.ines))
    ContactMethod.objects.filter(value="ines@example.com").update(added_by_import=None)

    api.login(world.ela).post(f"/imports/{batch.pk}/undo")

    assert world.ines.contact_methods.filter(value="ines@example.com").exists()
