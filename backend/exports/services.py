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
from people.models import Person
from reminders.models import ReminderSettings

README = """\
FolkBook export

folkbook.json holds your people, their links and spaces, and everything you wrote about
them: notes, memory aids, timeline and reminders. photos/ holds their photos.

It includes your private notes. Keep it somewhere safe.
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


def build(access: Access) -> tuple[ExportFile, Photos]:
    if not can_export_everything(access):
        raise PermissionDenied("This access can't take a full export.")
    user = access.user
    people = list(
        exported_people(access)
        .select_related("owner__me")
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
    ids = {person.pk for person in people}
    spaces = list(
        visible_spaces(access)
        .filter(owner=user)
        .prefetch_related(Prefetch("people", Person.objects.filter(pk__in=ids), to_attr="exported"))
        .order_by("created_at", "pk")
    )
    space_ids = {space.pk for space in spaces}
    photos: Photos = []

    def person_out(person: Person) -> PersonExport:
        photo = None
        if person.photo:
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
            tags=sorted((tag.name for tag in person.tags.all()), key=str.casefold),
            photo=photo,
            photo_caption=person.photo_caption,
            contacts=[
                ContactExport(kind=c.kind, label=c.label, value=c.value)
                for c in person.contacts_shown
            ],
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

    settings = ReminderSettings.objects.filter(user=user).first()
    export = ExportFile(
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
            for link in visible_relationships(access)
            .filter(owner=user, person_a__in=ids, person_b__in=ids)
            .order_by("created_at", "pk")
        ],
        notes=[
            NoteExport(person=note.person_id, body=note.body, updated_at=note.updated_at)
            for note in visible_notes(access).filter(person__in=ids).order_by("created_at")
        ],
        memory_aids=[
            MemoryAidExport(
                person=aid.person_id,
                text=aid.text,
                pinned=aid.pinned,
                position=aid.position,
                added_at=aid.created_at,
            )
            for aid in visible_memory_aids(access).filter(person__in=ids)
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
            for entry in visible_interactions(access).filter(person__in=ids)
        ],
        keep_in_touch=[
            KeepInTouchExport(
                person=row.person_id,
                interval_days=row.interval_days,
                snoozed_until=row.snoozed_until,
                stopped=row.stopped,
            )
            for row in visible_keep_in_touch(access).filter(person__in=ids)
        ],
        reminder_settings=ReminderSettingsExport(
            nudges_on=settings.nudges_on, default_interval_days=settings.default_interval_days
        )
        if settings
        else None,
    )
    return export, photos


def write_zip(export: ExportFile, photos: Photos, out: IO[bytes]) -> None:
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("folkbook.json", export.model_dump_json(indent=2))
        archive.writestr("README.txt", README)
        for path, name in photos:
            with default_storage.open(name) as photo:
                # Photos are already compressed (WebP).
                archive.writestr(path, photo.read(), compress_type=zipfile.ZIP_STORED)


def export_zip(access: Access) -> IO[bytes]:
    """The .zip in a temporary file, rewound, for the response to stream."""
    export, photos = build(access)
    out = tempfile.TemporaryFile()  # noqa: SIM115 (the response closes it once sent)
    write_zip(export, photos, out)
    out.seek(0)
    return out


def summary(access: Access) -> ExportSummary:
    export, photos = build(access)
    size = len(export.model_dump_json(indent=2)) + sum(
        default_storage.size(name) for _, name in photos
    )
    return ExportSummary(people=len(export.people), photos=len(photos), size=size)
