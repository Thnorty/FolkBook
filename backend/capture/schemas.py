import datetime
from typing import Literal
from uuid import UUID

from ninja import Field, Schema
from pydantic import field_validator

from interactions.models import Interaction
from people.schemas import Birthday, PersonRef
from relationships.models import ParentType, RelationshipType

MAX_TEXT = 4000


class SuggestIn(Schema):
    text: str = Field(max_length=MAX_TEXT)
    today: datetime.date  # the device's: dates follow its time zone
    space_id: UUID | None = None  # put everyone new in this space

    @field_validator("text")
    @classmethod
    def _not_blank(cls, text: str) -> str:
        if not text.strip():
            raise ValueError("Write what happened first.")
        return text.strip()


class CurrentOut(Schema):
    """A matched person's fields as they are now, to show what a change would replace."""

    how_we_met: str
    work: str
    birthday: Birthday | None
    tags: list[str]


class CandidateOut(Schema):
    id: UUID
    name: str
    detail: str  # how you met, else work, else their spaces: to tell two Emmas apart
    owner: PersonRef | None  # the owner's Me
    current: CurrentOut
    can_edit: bool  # how we met, work and birthday
    can_tag: bool  # the owner only
    in_space: bool  # in the space chosen for this capture


class DraftPersonOut(Schema):
    ref: str
    name: str
    how_we_met: str | None
    work: str | None
    birthday: Birthday | None
    tags: list[str]
    # new: nobody like them; match: this is them (one candidate); choose: ask (up to three)
    match: Literal["new", "match", "choose"]
    candidates: list[CandidateOut]


class DraftConnectionOut(Schema):
    """`a` and `b` are refs or "me". For parent links, `a` is the parent of `b`."""

    id: str
    a: str
    b: str
    type: RelationshipType
    label: str
    parent_type: ParentType | None


class DraftAidOut(Schema):
    id: str
    about: str
    text: str


class DraftEntryOut(Schema):
    id: str
    about: str
    kind: Interaction.InteractionKind
    date: datetime.date
    label: str
    note: str


class DraftOut(Schema):
    """What the AI read, matched to your people. Nothing is saved yet."""

    people: list[DraftPersonOut]
    connections: list[DraftConnectionOut]
    memory_aids: list[DraftAidOut]
    entries: list[DraftEntryOut]


# ---------------------------------------------------------------- save and undo


class NewPersonIn(Schema):
    ref: str
    name: str = Field(min_length=1, max_length=200)
    how_we_met: str = Field("", max_length=300)
    work: str = Field("", max_length=200)
    birthday: Birthday | None = None
    tags: list[str] = []


class ChangesIn(Schema):
    """Only the fields sent are changed. Tags are added to the ones they have."""

    how_we_met: str | None = Field(None, max_length=300)
    work: str | None = Field(None, max_length=200)
    birthday: Birthday | None = None
    add_tags: list[str] = []


class ExistingPersonIn(Schema):
    ref: str
    person_id: UUID
    changes: ChangesIn = ChangesIn()


class ConnectionIn(Schema):
    """`a` and `b` are refs or "me". For parent links, `a` is the parent of `b`."""

    a: str
    b: str
    type: RelationshipType
    label: str = Field("", max_length=200)
    parent_type: ParentType | None = None


class AidIn(Schema):
    about: str
    text: str = Field(min_length=1, max_length=300)


class EntryIn(Schema):
    about: str
    kind: Interaction.InteractionKind
    date: datetime.date
    label: str = Field("", max_length=100)
    note: str = Field("", max_length=5000)


class SaveIn(Schema):
    """The reviewed capture. Refs tie the parts to `new_people` and `existing_people`.

    New people go into `space_id`; a link goes there too when both its people are in it.
    """

    space_id: UUID | None = None
    new_people: list[NewPersonIn] = []
    existing_people: list[ExistingPersonIn] = []
    connections: list[ConnectionIn] = []
    memory_aids: list[AidIn] = []
    entries: list[EntryIn] = []


class CountsOut(Schema):
    people: int
    connections: int
    memory_aids: int
    entries: int


class AddedOut(CountsOut):
    changes: int


class SavedPersonOut(Schema):
    id: UUID
    name: str
    new: bool


class SavedOut(Schema):
    capture_id: UUID
    added: AddedOut
    matched: list[str]  # the names of people you already had, in order
    people: list[SavedPersonOut]


class UndoneOut(Schema):
    removed: CountsOut
    restored: int  # changed fields put back (not those changed again since)
