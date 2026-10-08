from datetime import datetime
from typing import Literal
from uuid import UUID

from ninja import Field, Schema

from people.schemas import SpaceRef


class ApiKeyIn(Schema):
    name: str = Field(min_length=1, max_length=60)
    read_only: bool = True
    include_private: bool = False
    space_ids: list[UUID] | None = None  # None: all spaces
    expires_in: Literal["30d", "90d", "1y", "never"] = "90d"


class ApiKeyOut(Schema):
    id: UUID
    name: str
    last_five: str
    read_only: bool
    include_private: bool
    limited: bool
    spaces: list[SpaceRef]  # only those the user can still see
    expires_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime
    expired: bool


class CreatedApiKeyOut(ApiKeyOut):
    key: str  # the whole key: the only time it's sent
