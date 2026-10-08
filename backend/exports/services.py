"""The full export: everything in the user's book as one .zip, `folkbook.json` plus photos.

Everything is read through `access.policy`, so the export holds exactly what the user
can see of their own book and nothing of anyone else's private data.
"""

import os
import tempfile
import zipfile
from typing import IO

from django.core.exceptions import PermissionDenied
from django.core.files.storage import default_storage
from django.db.models import Prefetch, Q, QuerySet
from django.utils import timezone

from access.policy import (
    Access,
    can_export_everything,
    visible_contact_methods,
    visible_interactions,
    visible_keep_in_touch,
    visible_memory_aids,
    visible_notes,
    visible_people,
    visible_relationships,
    visible_spaces,
)
from core.db import by_name
from exports.schemas import (
    AccountExport,
    Birthday,
    ContactExport,
    ExportFile,
    ExportSummary,
    KeepInTouchExport,
    KeptExport,
    LinkExport,
    MemoryAidExport,
    NoteExport,
    PersonExport,
    ReminderSettingsExport,
    SharedExport,
    SpaceExport,
    TimelineExport,
)
from exports.vcard import card
from people.models import Person
from reminders.models import ReminderSettings
from spaces.models import Space

README = """\
FolkBook export

folkbook.json holds your people, their links and spaces, and everything you wrote about
them: notes, memory aids, timeline and reminders. photos/ holds their photos.

It includes your private notes. Keep it somewhere safe.
"""

PERSON_README = """\nFolkBook copy of one person

folkbook.json holds {name}, their links and spaces, and everything you wrote about them:
notes, memory aids, timeline and reminders. The people they're linked to come with just
their names and basics. photos/ holds {name}'s photo.

It's a copy to keep, not a book to restore. It includes your private notes. Keep it
somewhere safe.
"""

Photos = list[tuple[str, str]]  # (path in the .zip, file in storage)


def exported_people(access: Access) -> QuerySet[Person]:
    """Your own people, plus anyone else's you wrote about or linked to yourself."""
    your_links = visible_relationships(access).filter(owner=access.user)
    yours_or_written = (
        Q(owner=access.user)
        | Q(pk__in=visible_notes(access).values("person"))
        | Q(pk__in=visible_memory_aids(access).values("person"))
        | Q(pk__in=visible_interactions(access).values("person"))
        | Q(pk__in=visible_keep_in_touch(access).values("person"))
        | Q(pk__in=your_links.values("person_a"))
        | Q(pk__in=your_links.values("person_b"))
    )
    return visible_people(access).filter(yours_or_written)


def build(access: Access, only: Person | None = None) -> tuple[ExportFile, Photos]:
    """Everything in the book; or, with `only`, a copy of just that person (the people
    they're linked to come with their basic profile only)."""
    if not can_export_everything(access):
        raise PermissionDenied("This access can't take a full export.")
    user = access.user
    your_links = visible_relationships(access).filter(owner=user)
    if only:
        your_links = your_links.filter(Q(person_a=only) | Q(person_b=only))
        in_file = visible_people(access).filter(
            Q(pk=only.pk)
            | Q(pk__in=your_links.values("person_a"))
            | Q(pk__in=your_links.values("person_b"))
        )
    else:
        in_file = exported_people(access)
    people = list(
        in_file.select_related("owner__me")
        .prefetch_related(
            "tags",
            Prefetch(
                "contact_methods",
                visible_contact_methods(access).order_by("position"),
                to_attr="contacts_shown",
            ),
            Prefetch("spaces", visible_spaces(access).order_by("name"), to_attr="spaces_shown"),
        )
        .order_by("created_at", "pk")
    )
    ids = {row.pk for row in people}
    # Whose private data comes along, and in full: everyone, or just the one person.
    in_full = {only.pk} if only else ids
    own_spaces = visible_spaces(access).filter(owner=user)
    if only:
        own_spaces = own_spaces.filter(people=only)
    spaces = list(
        own_spaces.prefetch_related(
            Prefetch("people", Person.objects.filter(pk__in=ids), to_attr="exported")
        ).order_by("created_at", "pk")
    )
    space_ids = {space.pk for space in spaces}
    photos: Photos = []

    def person_out(person: Person) -> PersonExport:
        full = person.pk in in_full
        photo = None
        if person.photo and full:
            photo = f"photos/{person.pk}{os.path.splitext(person.photo.name)[1]}"
            photos.append((photo, person.photo.name))
        has_birthday = person.birth_day and person.birth_month
        return PersonExport(
            id=person.pk,
            is_me=person.account_id == user.pk,
            name=person.name,
            pronouns=person.pronouns,
            how_we_met=person.how_we_met,
            work=person.work,
            birthday=Birthday(
                day=person.birth_day, month=person.birth_month, year=person.birth_year
            )
            if has_birthday
            else None,
            tags=sorted((tag.name for tag in person.tags.all()), key=str.casefold) if full else [],
            photo=photo,
            photo_caption=person.photo_caption,
            contacts=[
                ContactExport(kind=c.kind, label=c.label, value=c.value)
                for c in person.contacts_shown
            ]
            if full
            else [],
            kept=KeptExport(at=person.kept_at, owner=person.kept_from, space=person.kept_space)
            if person.kept_at
            else None,
            shared=None
            if person.owner_id == user.pk
            else SharedExport(
                owner=person.owner.display_name,
                spaces=[space.name for space in person.spaces_shown],
            ),
            added_at=person.created_at,
        )

    # Settings belong to the account, not to anyone in a copy.
    settings = None if only else ReminderSettings.objects.filter(user=user).first()
    export = ExportFile(
        contents="person" if only else "everything",
        exported_at=timezone.now(),
        account=AccountExport(name=user.display_name, email=user.email),
        people=[person_out(person) for person in people],
        spaces=[
            SpaceExport(
                id=space.pk,
                name=space.name,
                color=space.color,
                description=space.description,
                share_contact_details=space.share_contact_details,
                people=[person.pk for person in space.exported],
            )
            for space in spaces
        ],
        links=[
            LinkExport(
                person_a=link.person_a_id,
                person_b=link.person_b_id,
                type=link.type,
                parent_type=link.parent_type,
                label=link.label,
                started_on=link.started_on,
                ended_on=link.ended_on,
                former=link.is_former,
                # A link in someone else's space comes along as a private one.
                space=link.space_id if link.space_id in space_ids else None,
            )
            for link in your_links.filter(person_a__in=ids, person_b__in=ids).order_by(
                "created_at", "pk"
            )
        ],
        notes=[
            NoteExport(person=note.person_id, body=note.body, updated_at=note.updated_at)
            for note in visible_notes(access).filter(person__in=in_full).order_by("created_at")
        ],
        memory_aids=[
            MemoryAidExport(
                person=aid.person_id,
                text=aid.text,
                pinned=aid.pinned,
                position=aid.position,
                added_at=aid.created_at,
            )
            for aid in visible_memory_aids(access).filter(person__in=in_full)
        ],
        timeline=[
            TimelineExport(
                person=entry.person_id,
                kind=entry.kind,
                label=entry.label,
                on=entry.occurred_on,
                at=entry.occurred_at,
                note=entry.note,
            )
            for entry in visible_interactions(access).filter(person__in=in_full)
        ],
        keep_in_touch=[
            KeepInTouchExport(
                person=row.person_id,
                interval_days=row.interval_days,
                snoozed_until=row.snoozed_until,
                stopped=row.stopped,
            )
            for row in visible_keep_in_touch(access).filter(person__in=in_full)
        ],
        reminder_settings=ReminderSettingsExport(
            nudges_on=settings.nudges_on, default_interval_days=settings.default_interval_days
        )
        if settings
        else None,
    )
    return export, photos


def write_zip(export: ExportFile, photos: Photos, out: IO[bytes], readme: str = README) -> None:
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("folkbook.json", export.model_dump_json(indent=2))
        archive.writestr("README.txt", readme)
        for path, name in photos:
            with default_storage.open(name) as photo:
                # Photos are already compressed (WebP).
                archive.writestr(path, photo.read(), compress_type=zipfile.ZIP_STORED)


def export_zip(access: Access, only: Person | None = None) -> IO[bytes]:
    """The .zip (of everything, or of `only`) in a temporary file, rewound, for the
    response to stream."""
    export, photos = build(access, only)
    out = tempfile.TemporaryFile()  # noqa: SIM115 (the response closes it once sent)
    readme = PERSON_README.format(name=only.name) if only else README
    write_zip(export, photos, out, readme)
    out.seek(0)
    return out


def summary(access: Access) -> ExportSummary:
    export, photos = build(access)
    size = len(export.model_dump_json(indent=2)) + sum(
        default_storage.size(name) for _, name in photos
    )
    return ExportSummary(people=len(export.people), photos=len(photos), size=size)


def contacts_vcf(access: Access, space: Space | None = None) -> str:
    """Everyone in your book (or in one space) as vCards: name, phone, email, birthday.
    Not you, and shared people's contact details only where their space shares them."""
    people = visible_people(access).exclude(account=access.user)
    if space:
        people = people.filter(spaces=space)
    people = people.prefetch_related(
        Prefetch(
            "contact_methods",
            visible_contact_methods(access).order_by("position", "created_at"),
            to_attr="contacts_shown",
        )
    ).order_by(by_name(), "pk")
    return "".join(card(person, person.contacts_shown) for person in people)
