"""Restore: rebuild the user's book from a full export (.zip), replacing what's in it.

It's for moving to a new server, so it only runs while nobody else shares the book:
then everything in it is the user's own, and clearing it takes nothing from anyone.

The file is untrusted. It's read with the export's own schemas, every id in it must
point at something in the same file, the rows are validated like any other input, and
photos go through the same pipeline as uploads. All of it happens in one transaction,
so a file that doesn't fit changes nothing.
"""

import datetime
import json
import zipfile
from collections.abc import Iterable
from typing import IO
from uuid import UUID

import pydantic
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import DatabaseError, models, transaction
from django.utils import timezone

from access.policy import Access, can_restore, shares_book
from accounts.models import User
from core.api import Conflict
from exports.schemas import ExportFile, LinkExport, PersonExport, RestoreSummary
from interactions.models import Interaction
from people import photos
from people.models import AccessEnded, ContactMethod, HiddenPerson, MemoryAid, Note, Person, Tag
from people.services import delete_after_commit, photo_files, store_photo
from relationships.models import Relationship
from relationships.services import stored_order
from reminders.models import KeepInTouch, ReminderSettings
from spaces.models import Space, SpacePerson

MAX_JSON_BYTES = 200 * 1024 * 1024
BATCH = 500

NOT_AN_EXPORT = "That file isn't a FolkBook export. Use the .zip from Export → Everything."
NEWER = "This export is from a newer version of FolkBook. Update this server first."
DAMAGED = "This export is damaged, so it can't be restored."
A_PERSON = (
    "This is a copy of one person, not a whole book, so it can't be restored. "
    "Use the .zip from Export → Everything."
)
TOO_BIG = "This export is too big to restore."
SHARED = (
    "Restore is for moving to a new server, so it only works while nothing in your "
    "book is shared. Stop sharing your spaces and leave the ones you're in first."
)

# Foreign keys point at rows made here, so validating them would only cost queries.
LINKS_TO_ROWS = ["owner", "account", "author", "user", "person", "person_a", "person_b", "space"]


def check(access: Access, upload: IO[bytes]) -> RestoreSummary:
    """What's in the file, if it can be restored. Changes nothing."""
    _check_allowed(access)
    export, _ = _read(upload)
    return _summary(export)


def restore(access: Access, upload: IO[bytes], confirm_email: str) -> RestoreSummary:
    """Replace everything in the user's book with the export in `upload`."""
    _check_allowed(access)
    user = access.user
    if confirm_email.strip().casefold() != user.email.casefold():
        raise ValidationError({"confirm_email": "That isn't your email."})
    export, archive = _read(upload)
    stored: list[str] = []  # new photo files, to remove if anything fails
    try:
        with transaction.atomic():
            User.objects.select_for_update().get(pk=user.pk)  # one restore at a time
            delete_after_commit(_clear(user))
            _rebuild(user, export, archive, stored)
    except BaseException as error:
        for name in stored:
            default_storage.delete(name)
        if isinstance(error, DatabaseError):  # broke a rule the database keeps
            raise _refusal(DAMAGED) from None
        raise
    return _summary(export)


def _check_allowed(access: Access) -> None:
    if not can_restore(access):
        raise PermissionDenied("This access can't restore a book.")
    if shares_book(access.user):
        raise Conflict(SHARED)


def _refusal(message: str) -> ValidationError:
    return ValidationError({"file": message})


def _summary(export: ExportFile) -> RestoreSummary:
    return RestoreSummary(
        name=export.account.name,
        email=export.account.email,
        exported_at=export.exported_at,
        people=len(export.people),
        spaces=len(export.spaces),
        photos=sum(1 for person in export.people if person.photo),
    )


# ---------------------------------------------------------------- reading the file


def _read(upload: IO[bytes]) -> tuple[ExportFile, zipfile.ZipFile]:
    upload.seek(0)
    try:
        archive = zipfile.ZipFile(upload)
        raw = _member(archive, "folkbook.json", MAX_JSON_BYTES, TOO_BIG)
        data = json.loads(raw) if raw is not None else None
    except (zipfile.BadZipFile, ValueError):
        raise _refusal(NOT_AN_EXPORT) from None
    if not isinstance(data, dict) or data.get("format") != "folkbook":
        raise _refusal(NOT_AN_EXPORT)
    version = data.get("version")
    if isinstance(version, int) and version > 1:
        raise _refusal(NEWER)
    try:
        export = ExportFile.model_validate(data)
    except pydantic.ValidationError:
        raise _refusal(DAMAGED) from None
    if export.contents != "everything":
        raise _refusal(A_PERSON)
    if not _fits_together(export, set(archive.namelist())):
        raise _refusal(DAMAGED)
    return export, archive


def _member(archive: zipfile.ZipFile, name: str, limit: int, too_big: str) -> bytes | None:
    """One file from the .zip, read no further than `limit` (the sizes it states can lie)."""
    try:
        info = archive.getinfo(name)
    except KeyError:
        return None
    if info.file_size > limit:
        raise _refusal(too_big)
    with archive.open(info) as file:
        content = file.read(limit + 1)
    if len(content) > limit:
        raise _refusal(too_big)
    return content


def _fits_together(export: ExportFile, files: set[str]) -> bool:
    """Every id in the file points at something in it, and there's one Me."""
    people = {person.id for person in export.people}
    spaces = {space.id for space in export.spaces}
    by_person = [*export.notes, *export.memory_aids, *export.timeline, *export.keep_in_touch]
    return (
        len(people) == len(export.people)
        and len(spaces) == len(export.spaces)
        and sum(person.is_me for person in export.people) == 1
        and all(person.photo in files for person in export.people if person.photo)
        and all(set(space.people) <= people for space in export.spaces)
        and all(
            {link.person_a, link.person_b} <= people and link.space in spaces | {None}
            for link in export.links
        )
        and all(row.person in people for row in by_person)
    )


# ---------------------------------------------------------------- replacing the book


def _clear(user: User) -> list[str]:
    """Remove everything in the user's book but their account and Me. Returns the photo
    files to delete once that's committed."""
    owned = Person.objects.filter(owner=user)
    files = [
        name for person in owned.only("photo", "photo_thumbnail") for name in photo_files(person)
    ]
    for model, field in [
        (Note, "author"),
        (MemoryAid, "author"),
        (Interaction, "author"),
        (KeepInTouch, "user"),
        (HiddenPerson, "user"),
        (AccessEnded, "user"),
        (Relationship, "owner"),
        (ReminderSettings, "user"),
        (Space, "owner"),
        (Tag, "owner"),
    ]:
        model.objects.filter(**{field: user}).delete()
    owned.exclude(account=user).delete()
    ContactMethod.objects.filter(person__account=user).delete()
    return files


def _rebuild(user: User, export: ExportFile, archive: zipfile.ZipFile, stored: list[str]) -> None:
    me = Person.objects.get(account=user)
    now = timezone.now()
    people: dict[UUID, Person] = {}
    for row in export.people:
        person = me if row.is_me else Person(owner=user)
        _fill(person, row, now)
        if row.photo:
            _photo(person, row, archive, stored)
        people[row.id] = _valid(person)
    me.save()
    _create(Person, [person for person in people.values() if person is not me])
    _keep_dates(Person, "created_at", [(people[row.id], row.added_at) for row in export.people])

    tags: dict[str, Tag] = {}
    for row in export.people:
        for name in row.tags:
            tags.setdefault(name.casefold(), _valid(Tag(owner=user, name=name)))
    _create(Tag, tags.values())
    _create(
        Person.tags.through,
        [
            Person.tags.through(person=people[row.id], tag=tags[key])
            for row in export.people
            for key in dict.fromkeys(name.casefold() for name in row.tags)
        ],
    )
    _create(
        ContactMethod,
        [
            _valid(ContactMethod(person=people[row.id], position=position, **contact.model_dump()))
            for row in export.people
            for position, contact in enumerate(row.contacts)
        ],
    )

    spaces = {
        row.id: _valid(
            Space(
                owner=user,
                name=row.name,
                color=row.color,
                description=row.description,
                share_contact_details=row.share_contact_details,
            )
        )
        for row in export.spaces
    }
    _create(Space, spaces.values())
    _create(
        SpacePerson,
        [
            SpacePerson(space=spaces[row.id], person=people[person], added_by=user)
            for row in export.spaces
            for person in dict.fromkeys(row.people)
        ],
    )
    _create(Relationship, [_link(user, row, people, spaces) for row in export.links])

    notes = [
        (_valid(Note(author=user, person=people[row.person], body=row.body)), row.updated_at)
        for row in export.notes
    ]
    _create(Note, [note for note, _ in notes])
    _keep_dates(Note, "updated_at", notes)
    aids = [
        (
            _valid(
                MemoryAid(
                    author=user,
                    person=people[row.person],
                    text=row.text,
                    pinned=row.pinned,
                    position=row.position,
                )
            ),
            row.added_at,
        )
        for row in export.memory_aids
    ]
    _create(MemoryAid, [aid for aid, _ in aids])
    _keep_dates(MemoryAid, "created_at", aids)
    _create(
        Interaction,
        [
            _valid(
                Interaction(
                    author=user,
                    person=people[row.person],
                    kind=row.kind,
                    label=row.label,
                    occurred_on=row.on,
                    occurred_at=row.at,
                    note=row.note,
                )
            )
            for row in export.timeline
        ],
    )
    _create(
        KeepInTouch,
        [
            _valid(
                KeepInTouch(
                    user=user,
                    person=people[row.person],
                    interval_days=row.interval_days,
                    snoozed_until=row.snoozed_until,
                    stopped=row.stopped,
                )
            )
            for row in export.keep_in_touch
        ],
    )
    if settings := export.reminder_settings:
        _valid(ReminderSettings(user=user, **settings.model_dump())).save()


def _fill(person: Person, row: PersonExport, now: datetime.datetime) -> None:
    person.name, person.pronouns = row.name, row.pronouns
    person.how_we_met, person.work = row.how_we_met, row.work
    birthday = row.birthday
    person.birth_day = birthday.day if birthday else None
    person.birth_month = birthday.month if birthday else None
    person.birth_year = birthday.year if birthday else None
    person.photo_caption = row.photo_caption
    person.photo = person.photo_thumbnail = ""
    person.kept_at, person.kept_from, person.kept_space = None, "", ""
    if row.kept:
        person.kept_at, person.kept_from, person.kept_space = (
            row.kept.at,
            row.kept.owner,
            row.kept.space,
        )
    elif row.shared:
        # Someone else's person, on a server where they don't exist: your own copy now.
        person.kept_at, person.kept_from = now, row.shared.owner
        person.kept_space = row.shared.spaces[0] if row.shared.spaces else ""


def _photo(person: Person, row: PersonExport, archive: zipfile.ZipFile, stored: list[str]) -> None:
    too_big = f"{row.name}'s photo in this export is too big."
    content = _member(archive, row.photo, photos.MAX_BYTES, too_big)
    try:
        store_photo(person, ContentFile(content, name=row.photo))
    except ValidationError:
        raise _refusal(f"{row.name}'s photo in this export can't be read.") from None
    stored.extend(photo_files(person))


def _link(
    user: User, row: LinkExport, people: dict[UUID, Person], spaces: dict[UUID, Space]
) -> Relationship:
    person_a, person_b = stored_order(row.type, people[row.person_a], people[row.person_b])
    return _valid(
        Relationship(
            owner=user,
            person_a=person_a,
            person_b=person_b,
            space=spaces.get(row.space),
            type=row.type,
            parent_type=row.parent_type,
            label=row.label,
            started_on=row.started_on,
            ended_on=row.ended_on,
            is_former=row.former,
        )
    )


def _valid[M: models.Model](row: M) -> M:
    """Field rules (lengths, choices, real dates); the database checks the rest."""
    try:
        row.full_clean(exclude=LINKS_TO_ROWS, validate_unique=False, validate_constraints=False)
    except ValidationError:
        raise _refusal(DAMAGED) from None
    return row


def _create(model: type[models.Model], rows: Iterable[models.Model]) -> None:
    model.objects.bulk_create(rows, batch_size=BATCH)


def _keep_dates(
    model: type[models.Model], field: str, rows: list[tuple[models.Model, datetime.datetime]]
) -> None:
    """Saving stamps rows with now; put back the dates from the export."""
    for row, date in rows:
        setattr(row, field, date)
    model.objects.bulk_update([row for row, _ in rows], [field], batch_size=BATCH)
