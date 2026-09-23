from uuid import UUID

from ninja import Field, Schema

from people.schemas import PersonRef
from spaces.models import Space


class SpaceOut(Schema):
    id: UUID
    name: str
    color: Space.Color
    description: str
    share_contact_details: bool
    role: str  # the viewer's role: owner / editor / viewer
    owner: PersonRef | None  # the owner's Me
    people_count: int
    member_count: int

    @staticmethod
    def resolve_owner(obj):
        return getattr(obj.owner, "me", None)


class SpaceIn(Schema):
    name: str = Field(min_length=1, max_length=100)
    color: Space.Color = Space.Color.SAGE
    description: str = Field("", max_length=300)


class SpacePatch(Schema):
    name: str | None = Field(None, min_length=1, max_length=100)
    color: Space.Color | None = None
    description: str | None = Field(None, max_length=300)
    share_contact_details: bool | None = None


class SpacePersonIn(Schema):
    person_id: UUID
