"""Creating and changing links. Every write checks the permission layer first."""

import datetime
from typing import Any

from django.core.exceptions import PermissionDenied
from django.db import transaction

from access.policy import Access, can_create_relationship, can_edit_relationship
from core.api import Conflict
from people.models import Person
from relationships.models import DIRECTIONAL_TYPES, Relationship, RelationshipType
from spaces.models import Space

EDITABLE_FIELDS = ("label", "started_on", "parent_type")


def stored_order(type: RelationshipType | str, a: Person, b: Person) -> tuple[Person, Person]:
    """Return (person_a, person_b) the way the link must be stored.

    Directional links keep their order ("a is the parent of b"). Symmetric links
    are stored once, lowest id first, so "a, b" and "b, a" can't both exist.
    """
    if type in DIRECTIONAL_TYPES or a.pk < b.pk:
        return a, b
    return b, a


@transaction.atomic
def create_relationship(
    access: Access, a: Person, b: Person, space: Space | None, data: dict[str, Any]
) -> Relationship:
    if not can_create_relationship(access, a, b, space):
        raise PermissionDenied("You can't link these people here.")
    person_a, person_b = stored_order(data["type"], a, b)
    link = Relationship(
        owner=access.user, person_a=person_a, person_b=person_b, space=space, **data
    )
    return _save(link)


@transaction.atomic
def update_relationship(
    access: Access, link: Relationship, changes: dict[str, Any]
) -> Relationship:
    _check_can_edit(access, link)
    for field in EDITABLE_FIELDS:
        if field in changes:
            setattr(link, field, changes[field])
    return _save(link)


@transaction.atomic
def end_relationship(
    access: Access, link: Relationship, ended_on: datetime.date | None
) -> Relationship:
    """A divorce, a job left behind: the link stays, marked as former."""
    _check_can_edit(access, link)
    link.is_former, link.ended_on = True, ended_on
    return _save(link)


@transaction.atomic
def reopen_relationship(access: Access, link: Relationship) -> Relationship:
    _check_can_edit(access, link)
    link.is_former, link.ended_on = False, None
    return _save(link)


def delete_relationship(access: Access, link: Relationship) -> None:
    _check_can_edit(access, link)
    link.delete()


def _check_can_edit(access: Access, link: Relationship) -> None:
    if not can_edit_relationship(access, link):
        raise PermissionDenied("Only the person who made this link can change it.")


def _save(link: Relationship) -> Relationship:
    duplicate = Relationship.objects.filter(
        owner=link.owner,
        person_a=link.person_a,
        person_b=link.person_b,
        type=link.type,
        is_former=False,
    ).exclude(pk=link.pk)
    if not link.is_former and duplicate.exists():
        raise Conflict("This link already exists.")
    link.full_clean()
    link.save()
    return link
