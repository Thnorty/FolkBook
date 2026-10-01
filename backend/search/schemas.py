from uuid import UUID

from ninja import Schema

from people.schemas import PersonOut, PersonRef
from spaces.schemas import SpaceOut


class MemoryAidHit(Schema):
    id: UUID
    text: str
    person: PersonRef


class NoteHit(Schema):
    person: PersonRef
    snippet: str  # the words around the match: "…first time climbing outdoors…"


class SearchOut(Schema):
    """Everything matching a search, among what the user can see (screens 4x, 4y)."""

    people: list[PersonOut]
    spaces: list[SpaceOut]
    memory_aids: list[MemoryAidHit]
    notes: list[NoteHit]
    did_you_mean: PersonRef | None  # when no one matches: the closest name (4z)
