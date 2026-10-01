import datetime
from uuid import UUID

from ninja import Field, Schema
from pydantic import model_validator

from people.models import Pronouns
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
    """Changing `type` also takes the two people again, in the order the new type reads
    (e.g. "Partner" → "Parent of Emma"). They must be the same two people."""

    type: RelationshipType | None = None
    person_a_id: UUID | None = None
    person_b_id: UUID | None = None
    parent_type: ParentType | None = None
    label: str | None = Field(None, max_length=200)
    started_on: datetime.date | None = None

    @model_validator(mode="after")
    def type_comes_with_both_people(self):
        if self.type and not (self.person_a_id and self.person_b_id):
            raise ValueError("Changing the type needs person_a_id and person_b_id.")
        return self


class EndIn(Schema):
    ended_on: datetime.date | None = None  # None: ended, date unknown


class FamilyRelationOut(Schema):
    person: PersonRef
    pronouns: Pronouns | None  # the person's, so the app can say "sister" for "sibling"
    relation: str  # parent, sibling, half_sibling, cousin, parent_in_law, …
    derived: bool
    former: bool
    parent_type: ParentType | None
    direct_link_id: UUID | None  # a stored "other family" link this explains

    @staticmethod
    def resolve_parent_type(obj):
        return obj.parent_type or None

    @staticmethod
    def resolve_pronouns(obj):
        return obj.person.pronouns or None

    @staticmethod
    def resolve_direct_link_id(obj):
        return obj.direct_link
