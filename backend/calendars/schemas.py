from datetime import datetime
from uuid import UUID

from ninja import Field, Schema

from people.schemas import SpaceRef


class CalendarFeedIn(Schema):
    name: str = Field(min_length=1, max_length=60)
    space_ids: list[UUID] | None = None  # None: everyone the user can see


class CalendarFeedOut(Schema):
    id: UUID
    name: str
    last_five: str
    limited: bool
    spaces: list[SpaceRef]  # only those the user can still see
    last_fetched_at: datetime | None
    created_at: datetime


class CreatedCalendarFeedOut(CalendarFeedOut):
    url: str  # the whole link: the only time it's sent
