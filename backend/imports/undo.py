"""Undoing an import: the people it added go (unless the user has written about them
since), and what its merges added is taken back, leaving anything changed since. Undo can
bring it all back for UNDO_WINDOW, like any delete."""

import datetime
from collections import defaultdict
from dataclasses import dataclass

from django.core.exceptions import PermissionDenied
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from access.policy import Access, can_undo_import
from core.api import Conflict
from core.db import by_name
from imports.models import Import, Merge
from imports.schemas import UndoPreviewOut
from interactions.models import Interaction
from people.models import ContactMethod, MemoryAid, Note, Person
from people.services import (
    TOO_LATE,
    UNDO_WINDOW,
    delete_after_commit,
    delete_person,
    restore_person,
)
from relationships.models import Relationship
from reminders.models import KeepInTouch


def undo_preview(access: Access, batch: Import) -> UndoPreviewOut:
    """Who would go, who stays because the user wrote about them since, and who would
    lose details the import's merges added."""
    _check_can_undo(access)
    goes, stays = _split(batch)
    loses = [person for person, taking in _taking_back(batch) if taking.anything]
    return UndoPreviewOut(goes=goes, stays=stays, loses_details=_by_name(loses))


def undo_import(access: Access, batch: Import) -> Import:
    _check_can_undo(access)
    with transaction.atomic():
        batch = _locked(batch)
        if batch.undone_at:
            raise Conflict("This import has already been undone.")
        # Set first: everyone this undo deletes is deleted at or after it, which is how
        # bringing them back tells them from people deleted by hand before.
        batch.undone_at = timezone.now()
        batch.save(update_fields=["undone_at", "updated_at"])
        goes, _ = _split(batch)
        for person in goes:
            delete_person(access, person)
        for person, taking in _taking_back(batch):
            taking.apply(person)
    return batch


def redo_import(access: Access, batch: Import) -> Import:
    """The toast's Undo: bring back everyone and everything the undo took."""
    _check_can_undo(access)
    with transaction.atomic():
        batch = _locked(batch)
        if batch.undone_at is None:
            raise Conflict("This import hasn't been undone.")
        if batch.undone_at < timezone.now() - UNDO_WINDOW:
            raise Conflict(TOO_LATE)
        for person in batch.people.filter(deleted_at__gte=batch.undone_at):
            restore_person(access, person)
        for merges in _by_person(batch.merges.filter(taken_back__isnull=False)).values():
            _put_back(merges[0].person, merges)
        batch.undone_at = None
        batch.save(update_fields=["undone_at", "updated_at"])
    return batch


def forget_photo_of(merge: Merge) -> None:
    """A merge record is going (its person or its import was deleted for good): so does
    the photo its undo took back, which nothing else points to."""
    if merge.taken_back and "photo" in merge.taken_back:
        delete_after_commit(merge.taken_back["photo"])


def forget_taken_back_photos(now: datetime.datetime | None = None) -> int:
    """Delete the photo files undone imports took back, once Undo can't bring them back.
    Returns how many merges had one."""
    cutoff = (now or timezone.now()) - UNDO_WINDOW
    merges = Merge.objects.filter(batch__undone_at__lt=cutoff, taken_back__has_key="photo")
    forgotten = 0
    for merge in merges:
        for name in merge.taken_back.pop("photo"):
            default_storage.delete(name)
        merge.save(update_fields=["taken_back", "updated_at"])
        forgotten += 1
    return forgotten


def _locked(batch: Import) -> Import:
    """The import as it is now, locked until the transaction ends, so a second undo or
    redo sent at the same moment waits and then sees what the first did."""
    return Import.objects.select_for_update().get(pk=batch.pk)


def _check_can_undo(access: Access) -> None:
    if not can_undo_import(access):
        raise PermissionDenied("This access can't undo imports.")


def _split(batch: Import) -> tuple[list[Person], list[Person]]:
    """The people the import added and still in the book: those who'd go, and those the
    user has written about since (a note, memory aid, timeline entry, keep-in-touch or
    link), who stay. The import's own notes were written before it finished."""
    people = list(batch.people.filter(deleted_at__isnull=True).order_by(by_name()))
    ids = [person.pk for person in people]
    since = Q(updated_at__gt=batch.finished_at)
    user = batch.owner_id
    written = set()
    for model, author in ((Note, "author"), (MemoryAid, "author"), (Interaction, "author")):
        found = model.objects.filter(since, person__in=ids, **{f"{author}_id": user})
        written |= set(found.values_list("person_id", flat=True))
    found = KeepInTouch.objects.filter(since, person__in=ids, user_id=user)
    written |= set(found.values_list("person_id", flat=True))
    links = Relationship.objects.filter(since, Q(person_a__in=ids) | Q(person_b__in=ids))
    for a, b in links.filter(owner_id=user).values_list("person_a_id", "person_b_id"):
        written |= {a, b}
    return (
        [person for person in people if person.pk not in written],
        [person for person in people if person.pk in written],
    )


@dataclass
class _Taking:
    """What undo takes back from one person, merge by merge (two merges in one import
    can add to the same person), with their note as it will be left."""

    merges: list[Merge]
    taken: dict  # merge id: what it takes back, as Merge.taken_back
    contacts: list[ContactMethod]
    note: Note | None
    note_left: str | None  # None: the note stays as it is

    @property
    def anything(self) -> bool:
        return any(self.taken.values())

    def apply(self, person: Person) -> None:
        """Take it all back; `person` already has the taken fields cleared."""
        ContactMethod.objects.filter(pk__in=[m.pk for m in self.contacts]).delete()
        person.save()
        if self.note and self.note_left is not None:
            if self.note_left.strip():
                self.note.body = self.note_left
                self.note.save(update_fields=["body", "updated_at"])
            else:
                self.note.delete()
        for merge in self.merges:
            merge.taken_back = self.taken[merge.pk]
            merge.save(update_fields=["taken_back", "updated_at"])


def _taking_back(batch: Import) -> list[tuple[Person, _Taking]]:
    """For each person the import merged into (and still in the book), what undo takes
    back. Clears the taken fields on the person objects, unsaved."""
    by_person = _by_person(batch.merges.filter(person__deleted_at__isnull=True))
    contacts: dict = defaultdict(list)
    added = ContactMethod.objects.filter(added_by_import=batch, person__in=by_person)
    for method in added.order_by("position"):
        contacts[method.person_id].append(method)
    notes = {
        note.person_id: note
        for note in Note.objects.filter(author_id=batch.owner_id, person__in=by_person)
    }
    return [
        (merges[0].person, _take(merges, contacts[person_id], notes.get(person_id)))
        for person_id, merges in by_person.items()
    ]


def _by_person(merges: QuerySet[Merge]) -> dict:
    """Merges grouped by who they merged into, sharing one person object."""
    grouped: dict = defaultdict(list)
    for merge in merges.select_related("person").order_by("created_at"):
        if grouped[merge.person_id]:
            merge.person = grouped[merge.person_id][0].person
        grouped[merge.person_id].append(merge)
    return grouped


def _take(merges: list[Merge], contacts: list[ContactMethod], note: Note | None) -> _Taking:
    person = merges[0].person
    taken: dict = {merge.pk: {} for merge in merges}
    # The contact details and the note's text can't be told apart by merge, so the first
    # merge keeps them all.
    first = taken[merges[0].pk]
    if contacts:
        first["contacts"] = [
            {"kind": m.kind, "label": m.label, "value": m.value, "position": m.position}
            for m in contacts
        ]
    for merge in merges:
        filled, taking = merge.filled, taken[merge.pk]
        if "work" in filled and person.work == filled["work"]:
            taking["work"], person.work = filled["work"], ""
        birthday = [person.birth_day, person.birth_month, person.birth_year]
        if "birthday" in filled and birthday == filled["birthday"]:
            taking["birthday"] = filled["birthday"]
            person.birth_day = person.birth_month = person.birth_year = None
        if "photo" in filled and person.photo.name == filled["photo"]:
            taking["photo"] = [person.photo.name, person.photo_thumbnail.name]
            person.photo = person.photo_thumbnail = ""
    note_left = _note_left(note, merges)
    if note and note_left is not None:
        first["note"] = note.body.removeprefix(note_left)
    return _Taking(merges, taken, contacts, note, note_left)


def _note_left(note: Note | None, merges: list[Merge]) -> str | None:
    """The note with the merges' text taken off its end, while it's still there. Newest
    first, but without trusting the clock to tell merges a moment apart: whichever text
    is at the end goes next."""
    if note is None:
        return None
    body = note.body
    waiting = [merge.note for merge in merges if merge.note]
    while found := next((text for text in waiting if body.endswith(text)), None):
        body = body.removesuffix(found)
        waiting.remove(found)
    return body if body != note.body else None


def _put_back(person: Person, merges: list[Merge]) -> None:
    """Put back what undo took from `person`, where nothing has taken its place since."""
    for merge in merges:
        taken = merge.taken_back
        ContactMethod.objects.bulk_create(
            ContactMethod(person=person, added_by_import_id=merge.batch_id, **contact)
            for contact in taken.get("contacts", [])
        )
        if "work" in taken and not person.work:
            person.work = taken["work"]
        if "birthday" in taken and person.birth_day is None:
            person.birth_day, person.birth_month, person.birth_year = taken["birthday"]
        if "photo" in taken:
            if person.photo:  # they have a new one: the taken one isn't needed any more
                delete_after_commit(taken["photo"])
            else:
                person.photo, person.photo_thumbnail = taken["photo"]
        if "note" in taken:
            _append_note(person, merge.batch.owner_id, taken["note"])
        merge.taken_back = None
        merge.save(update_fields=["taken_back", "updated_at"])
    person.save()


def _append_note(person: Person, author_id, text: str) -> None:
    note = Note.objects.filter(author_id=author_id, person=person).first()
    if note:
        note.body += text
        note.save(update_fields=["body", "updated_at"])
    else:
        Note.objects.create(author_id=author_id, person=person, body=text.lstrip())


def _by_name(people: list[Person]) -> list[Person]:
    ids = [person.pk for person in people]
    return list(Person.objects.filter(pk__in=ids).order_by(by_name()))
