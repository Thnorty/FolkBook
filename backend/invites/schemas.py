import datetime
from uuid import UUID

from ninja import Field, Schema

from people.schemas import PersonRef, SpaceRef
from spaces.models import SpaceMembership


class InviteIn(Schema):
    expires_in_days: int = Field(7, ge=1, le=30)
    max_uses: int = Field(1, ge=1, le=100)
    space_id: UUID | None = None  # also share this space (you must own it)
    role: SpaceMembership.Role = SpaceMembership.Role.VIEWER


class InviteOut(Schema):
    id: UUID
    token: str
    path: str  # the link to share: the app's address + this path
    created_by: PersonRef | None
    expires_at: datetime.datetime
    max_uses: int
    uses: int
    is_usable: bool
    space: SpaceRef | None
    role: SpaceMembership.Role

    @staticmethod
    def resolve_path(obj):
        return f"/i/{obj.token}"

    @staticmethod
    def resolve_created_by(obj):
        return getattr(obj.created_by, "me", None)


class InvitePreviewOut(Schema):
    """What someone opening an invite link sees before signing up."""

    invited_by: str
    expires_at: datetime.datetime
    space: SpaceRef | None
    space_people_count: int | None
    role: SpaceMembership.Role


class SignUpIn(Schema):
    name: str = Field(min_length=1, max_length=200)
    email: str = Field(max_length=254)
    password: str = Field(max_length=4096)


class SetupStatusOut(Schema):
    needed: bool
