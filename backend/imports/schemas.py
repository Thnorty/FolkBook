from typing import Literal

from ninja import Schema

from people.schemas import Birthday, PersonRef, PhotoOut, SpaceRef


class DetailOut(Schema):
    value: str
    label: str


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
