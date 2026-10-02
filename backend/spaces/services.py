"""Creating and changing spaces. Every write checks the permission layer first."""

from typing import Any

from django.core.exceptions import PermissionDenied
from django.db import transaction
from django.db.models import Q
from django.db.models.functions import Lower

from access.policy import (
    Access,
    can_add_person_to_space,
    can_change_space_people,
    can_leave_space,
    can_manage_space,
)
from accounts.models import User
from core.api import Conflict
from people import kept
from people.kept import Change, Reason, keeping_copies
from people.models import Person
from spaces.models import Space, SpaceMembership, SpacePerson

EDITABLE_FIELDS = ("name", "color", "description", "share_contact_details")


def create_space(access: Access, data: dict[str, Any]) -> Space:
    """A new space, private to its owner until shared."""
    if access.read_only or access.is_space_limited:
        raise PermissionDenied("This access can't create spaces.")
    _check_name_is_free(access, data["name"])
    return Space.objects.create(owner=access.user, **data)


@transaction.atomic
def update_space(access: Access, space: Space, changes: dict[str, Any]) -> Space:
    if not can_manage_space(access, space):
        raise PermissionDenied("Only the owner can change this space.")
    if "name" in changes:
        _check_name_is_free(access, changes["name"], exclude=space)
    for field in EDITABLE_FIELDS:
        if field in changes:
            setattr(space, field, changes[field])
    space.save()
    return space


def delete_space(access: Access, space: Space) -> None:
    """Deletes the space only: its people and links stay in their owners' books.

    Members keep copies of anyone they wrote about.
    """
    if not can_manage_space(access, space):
        raise PermissionDenied("Only the owner can delete this space.")
    told = {user.pk: Reason.SPACE_DELETED for user in _members(space)}
    with keeping_copies(_everyone_in(space), _change(access, space, told)):
        space.delete()


def add_person(access: Access, space: Space, person: Person) -> None:
    if not can_add_person_to_space(access, person, space):
        raise PermissionDenied(f"You can't add {person.name} to {space.name}.")
    space.people.add(person, through_defaults={"added_by": access.user})


def remove_person(access: Access, space: Space, person: Person) -> None:
    """Take someone out of the space. Members who lose them keep what they wrote."""
    if not can_change_space_people(access, space):
        raise PermissionDenied(f"You can't remove people from {space.name}.")
    change = Change(
        by=access.user, reason=Reason.PERSON_REMOVED, space=space.name, about=person.name
    )
    with keeping_copies(_everyone_in(space), change):
        space.people.remove(person)


def _check_name_is_free(access: Access, name: str, exclude: Space | None = None) -> None:
    taken = Space.objects.filter(owner=access.user, name__iexact=name)
    if exclude:
        taken = taken.exclude(pk=exclude.pk)
    if taken.exists():
        raise Conflict(f"You already have a space called “{name}”.")


# ---------------------------------------------------------------- members


def members_of(space: Space) -> list[dict[str, Any]]:
    """Everyone in the space, owner first, then members by name."""
    owner = {"user": space.owner, "role": "owner"}
    members = [
        {"user": membership.user, "role": membership.role}
        for membership in space.memberships.select_related("user__me")
    ]
    return [owner, *sorted(members, key=lambda member: member["user"].display_name.casefold())]


def people_to_share_with(access: Access, space: Space, text: str):
    """Accounts on this server matching `text` that aren't in the space yet. Owner only."""
    if not can_manage_space(access, space):
        raise PermissionDenied("Only the owner can share this space.")
    taken = [space.owner_id, *space.memberships.values_list("user_id", flat=True)]
    return (
        User.objects.filter(is_active=True)
        .exclude(pk__in=taken)
        .filter(Q(email__icontains=text) | Q(me__name__unaccent__icontains=text))
        .select_related("me")
        .order_by(Lower("email"))[:8]
    )


@transaction.atomic
def share_with(access: Access, space: Space, user: User, role: str) -> SpaceMembership:
    """Add `user` as a member: they see the space's people and its links."""
    if not can_manage_space(access, space):
        raise PermissionDenied("Only the owner can share this space.")
    if user.pk == space.owner_id or space.memberships.filter(user=user).exists():
        raise Conflict(f"{user.display_name} is already in {space.name}.")
    if not user.is_active:
        raise Conflict(f"{user.display_name}'s account is deactivated.")
    return SpaceMembership.objects.create(space=space, user=user, role=role)


def change_role(access: Access, membership: SpaceMembership, role: str) -> SpaceMembership:
    if not can_manage_space(access, membership.space):
        raise PermissionDenied("Only the owner can change roles.")
    membership.role = role
    membership.save(update_fields=["role", "updated_at"])
    return membership


# ---------------------------------------------------------------- access ending


def leave(access: Access, space: Space) -> list[Person]:
    """Stop seeing a space you're a member of. Returns the copies you kept."""
    if not can_leave_space(access, space):
        raise PermissionDenied("Only members can leave a space.")
    with keeping_copies(_everyone_in(space), _change(access, space)) as change:
        _end_membership(space, access.user)
    return change.kept[access.user.pk]


def what_leaving_loses(access: Access, space: Space) -> tuple[int, list[Person], int]:
    """If you left: how many people would leave your book, who you'd keep a copy of,
    and how many of your own people would leave the space with you."""
    if not can_leave_space(access, space):
        raise PermissionDenied("Only members can leave a space.")
    lost, copies = kept.would_lose(access.user, lambda: _end_membership(space, access.user))
    own = SpacePerson.objects.filter(space=space, person__owner=access.user).count()
    return lost, copies, own


def remove_member(access: Access, membership: SpaceMembership) -> None:
    """The owner takes someone out of the space; they keep copies of who they wrote about."""
    space = membership.space
    if not can_manage_space(access, space):
        raise PermissionDenied("Only the owner can remove members.")
    told = {membership.user_id: Reason.REMOVED}
    with keeping_copies(_everyone_in(space), _change(access, space, told, membership.user)):
        _end_membership(space, membership.user)


def stop_sharing(access: Access, space: Space) -> None:
    """Remove every member at once; the space is private to its owner again."""
    if not can_manage_space(access, space):
        raise PermissionDenied("Only the owner can stop sharing this space.")
    members = _members(space)
    told = {user.pk: Reason.STOPPED_SHARING for user in members}
    with keeping_copies(_everyone_in(space), _change(access, space, told)):
        for user in members:
            _end_membership(space, user)


def _end_membership(space: Space, user: User) -> None:
    space.memberships.filter(user=user).delete()
    # Their own people can't stay where their owner no longer takes part.
    SpacePerson.objects.filter(space=space, person__owner=user).delete()


def _members(space: Space) -> list[User]:
    return [m.user for m in space.memberships.select_related("user__me")]


def _everyone_in(space: Space) -> list[User]:
    return [space.owner, *_members(space)]


def _change(
    access: Access, space: Space, told: dict | None = None, member: User | None = None
) -> Change:
    """Users who keep copies because a member left (or was removed) are told who it was."""
    gone = member or access.user
    return Change(
        by=access.user,
        reason=Reason.MEMBER_LEFT,
        space=space.name,
        about=gone.display_name,
        told=told or {},
    )
