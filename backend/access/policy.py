"""The one place that decides what someone can see and change.

Every endpoint, search, graph query, export and API-key request must get its
data through these functions. Never filter by owner or space "by hand" in a
view or service. See the privacy rules in AGENTS.md and docs/DECISIONS.md.

Reads return querysets so callers can filter, paginate and prefetch further.
Writes are `can_*` checks that return a bool.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from django.db.models import (
    Case,
    CharField,
    Exists,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Value,
    When,
)

from accounts.models import User
from interactions.models import Interaction
from people.models import ContactMethod, MemoryAid, Note, Person
from relationships.models import Relationship
from reminders.models import KeepInTouch
from spaces.models import Space, SpaceMembership, SpacePerson

Role = Literal["owner", "editor", "viewer"]


@dataclass(frozen=True)
class Access:
    """Who is asking, and how far their access reaches.

    A logged-in user gets full access to what they can see. API keys narrow it:
    to some spaces, without private notes, or read-only.
    """

    user: User
    space_ids: frozenset[UUID] | None = None  # None: every space the user can see
    include_private: bool = True
    read_only: bool = False

    @classmethod
    def for_user(cls, user: User) -> "Access":
        return cls(user=user)

    @classmethod
    def limited(
        cls,
        user: User,
        space_ids: Iterable[UUID] | None = None,
        include_private: bool = False,
        read_only: bool = True,
    ) -> "Access":
        return cls(
            user=user,
            space_ids=None if space_ids is None else frozenset(space_ids),
            include_private=include_private,
            read_only=read_only,
        )

    @property
    def is_space_limited(self) -> bool:
        return self.space_ids is not None


# ---------------------------------------------------------------- spaces


def visible_spaces(access: Access) -> QuerySet[Space]:
    """Spaces the user owns or is a member of (within the access scope)."""
    is_member = Exists(SpaceMembership.objects.filter(space=OuterRef("pk"), user=access.user))
    spaces = Space.objects.filter(Q(owner=access.user) | is_member)
    if access.is_space_limited:
        spaces = spaces.filter(pk__in=access.space_ids)
    return spaces


def visible_spaces_with_role(access: Access) -> QuerySet[Space]:
    """`visible_spaces`, each annotated with the user's `role` in it (one query)."""
    member_role = SpaceMembership.objects.filter(space=OuterRef("pk"), user=access.user).values(
        "role"
    )[:1]
    return visible_spaces(access).annotate(
        role=Case(
            When(owner=access.user, then=Value("owner")),
            default=Subquery(member_role),
            output_field=CharField(),
        )
    )


def editable_spaces(access: Access) -> QuerySet[Space]:
    """Spaces where the user may add people and links: as owner or editor."""
    if access.read_only:
        return Space.objects.none()
    is_editor = Exists(
        SpaceMembership.objects.filter(
            space=OuterRef("pk"), user=access.user, role=SpaceMembership.Role.EDITOR
        )
    )
    return visible_spaces(access).filter(Q(owner=access.user) | is_editor)


def space_role(access: Access, space: Space) -> Role | None:
    if access.is_space_limited and space.pk not in access.space_ids:
        return None
    if space.owner_id == access.user.pk:
        return "owner"
    membership = SpaceMembership.objects.filter(space=space, user=access.user).first()
    return membership.role if membership else None


def _people_in(spaces: QuerySet[Space]) -> Q:
    """People who are in any of `spaces`: added to it, or the Me of its owner or a member."""
    added = Exists(SpacePerson.objects.filter(person=OuterRef("pk"), space__in=spaces))
    participants = User.objects.filter(
        Q(owned_spaces__in=spaces) | Q(space_memberships__space__in=spaces)
    )
    return added | Q(account__in=participants)


# ---------------------------------------------------------------- people


def visible_people(access: Access) -> QuerySet[Person]:
    """Everyone the user can see: their own book, plus people in spaces they can see."""
    own = Q(account=access.user)
    if not access.is_space_limited:
        own |= Q(owner=access.user)
    return Person.objects.filter(own | _people_in(visible_spaces(access)))


def can_see_person(access: Access, person: Person) -> bool:
    return visible_people(access).filter(pk=person.pk).exists()


def visible_contact_methods(access: Access) -> QuerySet[ContactMethod]:
    """Phone numbers and emails: the owner's own, or shared by a space that allows it."""
    sharing_spaces = visible_spaces(access).filter(share_contact_details=True)
    allowed = Person.objects.filter(Q(owner=access.user) | _people_in(sharing_spaces))
    return ContactMethod.objects.filter(
        person__in=visible_people(access).filter(pk__in=allowed.values("pk"))
    )


def can_edit_person(access: Access, person: Person) -> bool:
    """The owner can edit a person; editors of a space the person is in can fix basic details.

    Nobody but the user themselves can edit a user's Me.
    """
    if access.read_only or not can_see_person(access, person):
        return False
    if person.owner_id == access.user.pk:
        return True
    if person.account_id is not None:
        return False
    return editable_spaces(access).filter(spaceperson__person=person).exists()


def can_delete_person(access: Access, person: Person) -> bool:
    """Only the owner can delete a person, and never a Me (that's deleting the account)."""
    return (
        not access.read_only
        and person.owner_id == access.user.pk
        and person.account_id is None
        and can_see_person(access, person)
    )


# ---------------------------------------------------------------- spaces (writes)


def can_manage_space(access: Access, space: Space) -> bool:
    """Rename, recolor, share, change members or the contact-details toggle: owner only."""
    return not access.read_only and space_role(access, space) == "owner"


def can_change_space_people(access: Access, space: Space) -> bool:
    return editable_spaces(access).filter(pk=space.pk).exists()


def can_add_person_to_space(access: Access, person: Person, space: Space) -> bool:
    """Add a person to a space.

    The person's owner must already take part in the space, so nobody can pass
    someone else's people on to users the owner never shared them with. A Me
    is never added: it shows up in every space its user takes part in.
    """
    if person.account_id is not None or not can_change_space_people(access, space):
        return False
    owner_takes_part = (
        space.owner_id == person.owner_id
        or space.memberships.filter(user_id=person.owner_id).exists()
    )
    return owner_takes_part and can_see_person(access, person)


# ---------------------------------------------------------------- relationships


def visible_relationships(access: Access) -> QuerySet[Relationship]:
    """Links in a space the user can see, plus their own private links.

    Seeing both people is not enough: the link's space must be visible too.
    And a link is only shown when the user can see both people.
    """
    in_visible_space = Q(space__in=visible_spaces(access))
    if not access.is_space_limited:
        in_visible_space |= Q(space__isnull=True, owner=access.user)
    people = visible_people(access)
    return Relationship.objects.filter(in_visible_space, person_a__in=people, person_b__in=people)


def can_create_relationship(
    access: Access, a: Person, b: Person, space: Space | None = None
) -> bool:
    """Link two people the user can see, privately or inside a space they can edit.

    A link inside a space needs both people to be in that space, so everyone
    who sees the link also sees who it connects.
    """
    if access.read_only or not (can_see_person(access, a) and can_see_person(access, b)):
        return False
    if space is None:
        return not access.is_space_limited
    if not can_change_space_people(access, space):
        return False
    in_space = Person.objects.filter(_people_in(Space.objects.filter(pk=space.pk)))
    return in_space.filter(pk__in=[a.pk, b.pk]).count() == 2


def can_edit_relationship(access: Access, relationship: Relationship) -> bool:
    return (
        not access.read_only
        and relationship.owner_id == access.user.pk
        and visible_relationships(access).filter(pk=relationship.pk).exists()
    )


# ---------------------------------------------------------------- private data


def _private(queryset: QuerySet, access: Access, author_field: str = "author") -> QuerySet:
    """Private data is only ever the user's own, and only about people they can see."""
    if not access.include_private:
        return queryset.none()
    return queryset.filter(**{author_field: access.user}, person__in=visible_people(access))


def visible_notes(access: Access) -> QuerySet[Note]:
    return _private(Note.objects.all(), access)


def visible_memory_aids(access: Access) -> QuerySet[MemoryAid]:
    return _private(MemoryAid.objects.all(), access)


def visible_interactions(access: Access) -> QuerySet[Interaction]:
    return _private(Interaction.objects.all(), access)


def visible_keep_in_touch(access: Access) -> QuerySet[KeepInTouch]:
    return _private(KeepInTouch.objects.all(), access, author_field="user")


def can_write_private(access: Access, person: Person) -> bool:
    """Add notes, memory aids, timeline entries or reminders about a person."""
    return not access.read_only and access.include_private and can_see_person(access, person)
