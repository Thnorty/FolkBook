"""The full export's format (`folkbook.json` in the .zip), version 1.

Restore reads the same schemas back, so this is the one definition of the format.
Ids are only references inside one file: restore gives everything new ids.
"""

import datetime
from typing import Literal
from uuid import UUID

from ninja import Schema


class Birthday(Schema):
    day: int
    month: int
    year: int | None


class ContactExport(Schema):
    kind: str  # phone / email / …
    label: str
    value: str


class KeptExport(Schema):
    """A kept copy: whose book the person was in, and in which space (blank: theirs)."""

    at: datetime.datetime
    owner: str
    space: str


class SharedExport(Schema):
    """Someone else's person you wrote about: whose they are, and where you see them.
    Restore makes them your own kept copy."""

    owner: str
    spaces: list[str]


class PersonExport(Schema):
    id: UUID
    is_me: bool
    name: str
    pronouns: str
    how_we_met: str
    work: str
    birthday: Birthday | None
    tags: list[str]
    photo: str | None  # path inside the .zip
    photo_caption: str
    contacts: list[ContactExport]
    kept: KeptExport | None
    shared: SharedExport | None
    added_at: datetime.datetime


class SpaceExport(Schema):
    id: UUID
    name: str
    color: str
    description: str
    share_contact_details: bool
    people: list[UUID]


class LinkExport(Schema):
    person_a: UUID
    person_b: UUID
    type: str
    parent_type: str
    label: str
    started_on: datetime.date | None
    ended_on: datetime.date | None
    former: bool
    space: UUID | None  # one of your spaces; None: a private link


class NoteExport(Schema):
    person: UUID
    body: str
    updated_at: datetime.datetime


class MemoryAidExport(Schema):
    person: UUID
    text: str
    pinned: bool
    position: int
    added_at: datetime.datetime


class TimelineExport(Schema):
    person: UUID
    kind: str
    label: str
    on: datetime.date
    at: datetime.time | None
    note: str


class KeepInTouchExport(Schema):
    person: UUID
    interval_days: int | None
    snoozed_until: datetime.date | None
    stopped: bool


class ReminderSettingsExport(Schema):
    nudges_on: bool
    default_interval_days: int | None


class AccountExport(Schema):
    name: str
    email: str


class ExportFile(Schema):
    format: Literal["folkbook"] = "folkbook"
    version: Literal[1] = 1
    exported_at: datetime.datetime
    account: AccountExport
    people: list[PersonExport]
    spaces: list[SpaceExport]
    links: list[LinkExport]
    notes: list[NoteExport]
    memory_aids: list[MemoryAidExport]
    timeline: list[TimelineExport]
    keep_in_touch: list[KeepInTouchExport]
    reminder_settings: ReminderSettingsExport | None


class ExportSummary(Schema):
    """What "Export .zip" would download: shown before you click."""

    people: int
    photos: int
    size: int  # bytes, before compression
