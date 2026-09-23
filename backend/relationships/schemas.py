import datetime
from uuid import UUID

from ninja import Field, Schema

from people.schemas import PersonRef, SpaceRef
from relationships.models import ParentType, RelationshipType


class RelationshipOut(Schema):
    """A stored link. Directional types read "person_a is the <type> of person_b"."""

    id: UUID
    person_a: PersonRef
    person_b: PersonRef
    type: RelationshipType
    parent_type: ParentType | None
    label: str
    started_on: datetime.date | None
    ended_on: datetime.date | None
    is_former: bool
    space: SpaceRef | None  # None: private to its owner
    is_mine: bool

    @staticmethod
    def resolve_parent_type(obj):
        return obj.parent_type or None

    @staticmethod
    def resolve_is_mine(obj, context):
        return obj.owner_id == context["request"].auth.pk


class RelationshipIn(Schema):
    """For directional types, `person_a` is the parent / grandparent / aunt or uncle."""

    person_a_id: UUID
    person_b_id: UUID
    type: RelationshipType
    parent_type: ParentType | None = None
    label: str = Field("", max_length=200)
    started_on: datetime.date | None = None
    space_id: UUID | None = None


class RelationshipPatch(Schema):
    parent_type: ParentType | None = None
    label: str | None = Field(None, max_length=200)
    started_on: datetime.date | None = None


class EndIn(Schema):
    ended_on: datetime.date | None = None  # None: ended, date unknown


class FamilyRelationOut(Schema):
    person: PersonRef
    relation: str  # parent, sibling, half_sibling, cousin, parent_in_law, …
    derived: bool
    former: bool
    parent_type: ParentType | None
    direct_link_id: UUID | None  # a stored "other family" link this explains

    @staticmethod
    def resolve_parent_type(obj):
        return obj.parent_type or None

    @staticmethod
    def resolve_direct_link_id(obj):
        return obj.direct_link
