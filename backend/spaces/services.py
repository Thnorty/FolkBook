"""Creating and changing spaces. Every write checks the permission layer first."""

from typing import Any

from django.core.exceptions import PermissionDenied
from django.db import transaction

from access.policy import (
    Access,
    can_add_person_to_space,
    can_change_space_people,
    can_manage_space,
)
from core.api import Conflict
from people.models import Person
from spaces.models import Space

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
    """Deletes the space only: its people and links stay in their owners' books."""
    if not can_manage_space(access, space):
        raise PermissionDenied("Only the owner can delete this space.")
    space.delete()


def add_person(access: Access, space: Space, person: Person) -> None:
    if not can_add_person_to_space(access, person, space):
        raise PermissionDenied(f"You can't add {person.name} to {space.name}.")
    space.people.add(person, through_defaults={"added_by": access.user})


def remove_person(access: Access, space: Space, person: Person) -> None:
    if not can_change_space_people(access, space):
        raise PermissionDenied(f"You can't remove people from {space.name}.")
    space.people.remove(person)


def _check_name_is_free(access: Access, name: str, exclude: Space | None = None) -> None:
    taken = Space.objects.filter(owner=access.user, name__iexact=name)
    if exclude:
        taken = taken.exclude(pk=exclude.pk)
    if taken.exists():
        raise Conflict(f"You already have a space called “{name}”.")
