from typing import Literal
from uuid import UUID

from ninja import Schema

from people.schemas import Birthday, PersonRef, PhotoOut, SpaceRef


class DetailOut(Schema):
    value: str
    label: str


class AdditionsOut(Schema):
    """What a merge would add: details they don't have, fields that are still empty."""

    phones: list[str]
    emails: list[str]
    work: str
    birthday: Birthday | None
    photo: bool
    note: bool


class MatchOut(Schema):
    """Who the contact may already be, with what they have now, to compare."""

    person: PersonRef
    owner: str
    photo: PhotoOut | None
    phones: list[str]
    emails: list[str]
    spaces: list[SpaceRef]
    reason: Literal["phone", "email", "name", "initial"]
    sure: bool
    can_merge: bool
    by_details: bool  # same phone or email: already in your book
    adds: AdditionsOut | None  # None when they can't be merged into


class ContactOut(Schema):
    index: int
    name: str
    phones: list[DetailOut]
    emails: list[DetailOut]
    birthday: Birthday | None
    work: str
    has_photo: bool
    match: MatchOut | None


class PreviewOut(Schema):
    file_name: str
    contacts: list[ContactOut]
    skipped: int  # contacts without a name


class PickIn(Schema):
    index: int
    action: Literal["new", "merge", "skip"]
    into: UUID | None = None  # for "merge": the person the preview matched


class ChoicesIn(Schema):
    picked: list[PickIn]
    space: UUID | None = None  # for the new people


class ImportOut(Schema):
    import_id: UUID
    added: int
    merged: int
    left_out: int  # not picked, or skipped: they stay in the phone
    space: SpaceRef | None
