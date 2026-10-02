from uuid import UUID

from ninja import Field, Schema

from people.schemas import PersonRef
from spaces.models import Space, SpaceMembership


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


class MemberOut(Schema):
    """Someone who can see a space: its owner, or a member and their role."""

    user_id: UUID
    name: str
    email: str
    role: str  # owner / editor / viewer
    is_you: bool


class ShareIn(Schema):
    user_id: UUID
    role: SpaceMembership.Role = SpaceMembership.Role.VIEWER


class RoleIn(Schema):
    role: SpaceMembership.Role


class CandidateParams(Schema):
    q: str = Field(min_length=2, max_length=100)  # part of a name or an email


class AccountOut(Schema):
    """An account on this server, to share a space with."""

    user_id: UUID
    name: str
    email: str


class KeptPreviewOut(Schema):
    """Someone you'd keep a copy of, and what you wrote about them (screen 5a)."""

    person: PersonRef
    notes: int
    memory_aids: int
    interactions: int

    @staticmethod
    def resolve_person(obj):
        return obj

    @staticmethod
    def resolve_notes(obj):
        return obj.note_count

    @staticmethod
    def resolve_memory_aids(obj):
        return obj.memory_aid_count

    @staticmethod
    def resolve_interactions(obj):
        return obj.interaction_count


class LeavePreviewOut(Schema):
    kept: list[KeptPreviewOut]  # copies you'd keep: you wrote about them
    leaving: int  # the others, who'd leave your book
    own_people: int  # people from your own book who'd leave the space with you


class LeftOut(Schema):
    kept: list[PersonRef]  # your new copies
