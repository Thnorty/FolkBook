"""Creating and changing people. Every write checks the permission layer first."""

import datetime
import secrets
from collections.abc import Iterable
from typing import Any

from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.utils import timezone

from access.policy import (
    Access,
    can_add_person_to_space,
    can_delete_person,
    can_edit_person,
    can_hide_person,
    can_write_private,
    visible_spaces,
)
from accounts.models import User
from core.api import Conflict
from people import kept, photos
from people.models import (
    AccessEnded,
    ContactMethod,
    HiddenPerson,
    MemoryAid,
    Note,
    Person,
    Tag,
)
from spaces import services as spaces
from spaces.models import Space

BASIC_FIELDS = ("name", "how_we_met", "work", "photo_caption")
# How long a deleted person can be brought back. The app offers Undo for 10 seconds;
# the rest is slack for a slow connection. The purge job runs every minute.
UNDO_WINDOW = datetime.timedelta(minutes=1)
OWNER_ONLY_FIELDS = ("tags", "contact_methods")


def create_me_person(user, name: str) -> Person:
    """Create the person that represents `user` in their own book."""
    return Person.objects.create(owner=user, account=user, name=name)


@transaction.atomic
def create_person(access: Access, data: dict[str, Any]) -> Person:
    """Add someone to the user's own book, optionally straight into some spaces."""
    if access.read_only or (access.is_space_limited and not data.get("space_ids")):
        raise PermissionDenied("This access can't add people.")
    person = Person(owner=access.user)
    _apply_basic(person, data)
    person.full_clean()
    person.save()
    set_tags(person, data.get("tags", []))
    _set_contact_methods(person, data.get("contact_methods", []))
    for space in _spaces(access, data.get("space_ids", [])):
        if not can_add_person_to_space(access, person, space):
            raise PermissionDenied(f"You can't add people to {space.name}.")
        space.people.add(person, through_defaults={"added_by": access.user})
    return person


@transaction.atomic
def update_person(access: Access, person: Person, changes: dict[str, Any]) -> Person:
    """Change the fields in `changes`. Editors may fix basic details only."""
    if not can_edit_person(access, person):
        raise PermissionDenied("You can't edit this person.")
    if person.owner_id != access.user.pk and any(f in changes for f in OWNER_ONLY_FIELDS):
        raise PermissionDenied("Only the owner can change tags and contact details.")
    _apply_basic(person, changes)
    person.full_clean()
    person.save()
    if "tags" in changes:
        set_tags(person, changes["tags"])
    if "contact_methods" in changes:
        _set_contact_methods(person, changes["contact_methods"])
    if "space_ids" in changes:
        _set_spaces(access, person, changes["space_ids"])
    return person


def delete_person(access: Access, person: Person) -> None:
    """Hide the person everywhere at once; they're deleted for good after UNDO_WINDOW."""
    if not can_delete_person(access, person):
        raise PermissionDenied("Only the owner can delete this person.")
    person.deleted_at = timezone.now()
    person.save(update_fields=["deleted_at", "updated_at"])


def hide_person(access: Access, person: Person) -> None:
    """Take a shared person out of the user's book; it changes nothing for anyone else."""
    if not can_hide_person(access, person):
        raise PermissionDenied("Only people shared with you can be removed from your book.")
    HiddenPerson.objects.get_or_create(user=access.user, person=person)


def unhide_person(access: Access, person: Person) -> None:
    """Add a hidden person back, with the notes and links the user kept about them."""
    if access.read_only:
        raise PermissionDenied("This access can't change your book.")
    HiddenPerson.objects.filter(user=access.user, person=person).delete()


def dismiss_access_ended(access: Access, notice: AccessEnded) -> None:
    """Take an "access ended" card off Today. The kept copies stay."""
    if access.read_only:
        raise PermissionDenied("This access can't change your book.")
    notice.delete()


def restore_person(access: Access, person: Person) -> Person:
    """Undo a delete, as long as it hasn't been made final yet."""
    if person.deleted_at is None or person.deleted_at < timezone.now() - UNDO_WINDOW:
        raise Conflict("It's too late to bring them back.")
    person.deleted_at = None
    person.save(update_fields=["deleted_at", "updated_at"])
    return person


def purge_deleted_people(now: datetime.datetime | None = None) -> int:
    """Delete for good everyone deleted more than UNDO_WINDOW ago. Returns how many.

    Other users who wrote about them keep a copy with what they wrote; the owner's
    notes, memory aids, timeline and links go with them.
    """
    cutoff = (now or timezone.now()) - UNDO_WINDOW
    purged = 0
    for person in Person.objects.filter(deleted_at__lt=cutoff).select_related("owner__me"):
        with transaction.atomic():
            files = _photo_files(person)
            writers = User.objects.filter(pk__in=kept.writers_about(person)).exclude(
                pk=person.owner_id
            )
            change = kept.Change(
                by=person.owner, reason=kept.Reason.PERSON_DELETED, about=person.name
            )
            # Visible again for a moment (inside this transaction only), so the writers
            # lose sight of them and keep copies before anything is deleted.
            deleted_at, person.deleted_at = person.deleted_at, None
            person.save(update_fields=["deleted_at"])
            with kept.keeping_copies(writers.select_related("me"), change):
                person.deleted_at = deleted_at
                person.save(update_fields=["deleted_at"])
            person.delete()
            _delete_after_commit(files)
        purged += 1
    return purged


# ---------------------------------------------------------------- photos


@transaction.atomic
def set_photo(access: Access, person: Person, upload: UploadedFile) -> Person:
    """Replace the person's photo with `upload`, cropped and re-encoded."""
    if not can_edit_person(access, person):
        raise PermissionDenied("You can't change this person's photo.")
    full, thumbnail = photos.prepare(upload)
    old_files = _photo_files(person)
    # A new name for every photo, so its URL changes and browsers never show the old one.
    name = secrets.token_hex(8)
    person.photo.save(f"{name}.webp", full, save=False)
    person.photo_thumbnail.save(f"{name}-thumbnail.webp", thumbnail, save=False)
    person.save(update_fields=["photo", "photo_thumbnail", "updated_at"])
    _delete_after_commit(old_files)
    return person


@transaction.atomic
def remove_photo(access: Access, person: Person) -> Person:
    if not can_edit_person(access, person):
        raise PermissionDenied("You can't change this person's photo.")
    old_files = _photo_files(person)
    person.photo = person.photo_thumbnail = ""
    person.save(update_fields=["photo", "photo_thumbnail", "updated_at"])
    _delete_after_commit(old_files)
    return person


def _photo_files(person: Person) -> list[str]:
    return [f.name for f in (person.photo, person.photo_thumbnail) if f]


def _delete_after_commit(names: list[str]) -> None:
    # Only once the database agrees, so a failed save never loses the old photo.
    transaction.on_commit(lambda: [default_storage.delete(name) for name in names])


def _apply_basic(person: Person, data: dict[str, Any]) -> None:
    for field in BASIC_FIELDS:
        if field in data:
            setattr(person, field, data[field])
    if "pronouns" in data:
        person.pronouns = data["pronouns"] or ""
    if "birthday" in data:
        birthday = data["birthday"] or {}
        person.birth_day = birthday.get("day")
        person.birth_month = birthday.get("month")
        person.birth_year = birthday.get("year")


def set_tags(person: Person, names: Iterable[str]) -> None:
    """Tags belong to the person's owner; reuse theirs, ignoring case."""
    tags = []
    for name in dict.fromkeys(n.strip() for n in names if n.strip()):
        tag = Tag.objects.filter(owner=person.owner, name__iexact=name).first()
        tags.append(tag or Tag.objects.create(owner=person.owner, name=name))
    person.tags.set(tags)


def _set_contact_methods(person: Person, methods: Iterable[dict[str, Any]]) -> None:
    person.contact_methods.all().delete()
    ContactMethod.objects.bulk_create(
        ContactMethod(person=person, position=position, **method)
        for position, method in enumerate(methods)
    )


def _set_spaces(access: Access, person: Person, ids: Iterable) -> None:
    """Make the person's spaces, among those you can see, exactly `ids`.

    Spaces you can't see keep the person; adding and removing check your rights.
    """
    wanted = {space.pk: space for space in _spaces(access, ids)}
    current = {space.pk: space for space in person.spaces.filter(pk__in=visible_spaces(access))}
    for pk in wanted.keys() - current.keys():
        spaces.add_person(access, wanted[pk], person)
    for pk in current.keys() - wanted.keys():
        spaces.remove_person(access, current[pk], person)


def _spaces(access: Access, ids: Iterable) -> list[Space]:
    ids = set(ids)
    spaces = list(visible_spaces(access).filter(pk__in=ids))
    if len(spaces) != len(ids):
        raise ValidationError({"space_ids": "One of these spaces doesn't exist."})
    return spaces


# ---------------------------------------------------------------- private data


def save_note(access: Access, person: Person, body: str) -> Note | None:
    """Replace the user's notes on a person. An empty text removes them."""
    _check_can_write_private(access, person)
    if not body.strip():
        Note.objects.filter(author=access.user, person=person).delete()
        return None
    note, _ = Note.objects.update_or_create(
        author=access.user, person=person, defaults={"body": body}
    )
    return note


def create_memory_aid(access: Access, person: Person, data: dict[str, Any]) -> MemoryAid:
    _check_can_write_private(access, person)
    last = MemoryAid.objects.filter(author=access.user, person=person).order_by("-position")
    position = (last.values_list("position", flat=True).first() or 0) + 1
    return MemoryAid.objects.create(author=access.user, person=person, position=position, **data)


def update_memory_aid(access: Access, aid: MemoryAid, changes: dict[str, Any]) -> MemoryAid:
    _check_can_write_private(access, aid.person)
    for field in ("text", "pinned", "position"):
        if field in changes:
            setattr(aid, field, changes[field])
    aid.save()
    return aid


def delete_memory_aid(access: Access, aid: MemoryAid) -> None:
    _check_can_write_private(access, aid.person)
    aid.delete()


def _check_can_write_private(access: Access, person: Person) -> None:
    if not can_write_private(access, person):
        raise PermissionDenied("This access can't change private notes.")
