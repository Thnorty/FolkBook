import datetime
from uuid import UUID

from ninja import Field, Schema

from interactions.models import Interaction


class InteractionOut(Schema):
    id: UUID
    person_id: UUID
    kind: Interaction.InteractionKind
    label: str
    occurred_on: datetime.date
    occurred_at: datetime.time | None  # the time of day, if given
    note: str


class InteractionIn(Schema):
    person_id: UUID
    kind: Interaction.InteractionKind
    label: str = Field("", max_length=100)
    occurred_on: datetime.date  # the app fills in today by default
    occurred_at: datetime.time | None = None
    note: str = Field("", max_length=5000)


class InteractionPatch(Schema):
    kind: Interaction.InteractionKind | None = None
    label: str | None = Field(None, max_length=100)
    occurred_on: datetime.date | None = None
    occurred_at: datetime.time | None = None  # send null to clear
    note: str | None = Field(None, max_length=5000)
