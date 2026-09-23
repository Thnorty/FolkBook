import datetime
from uuid import UUID

from ninja import Field, Schema

from interactions.models import Interaction


class InteractionOut(Schema):
    id: UUID
    person_id: UUID
    kind: Interaction.Kind
    label: str
    occurred_on: datetime.date
    note: str


class InteractionIn(Schema):
    person_id: UUID
    kind: Interaction.Kind
    label: str = Field("", max_length=100)
    occurred_on: datetime.date  # the app fills in today by default
    note: str = Field("", max_length=5000)


class InteractionPatch(Schema):
    kind: Interaction.Kind | None = None
    label: str | None = Field(None, max_length=100)
    occurred_on: datetime.date | None = None
    note: str | None = Field(None, max_length=5000)
