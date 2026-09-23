"""Creating and changing people. Every write checks the permission layer first."""

from collections.abc import Iterable
from typing import Any

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction

from access.policy import (
    Access,
    can_add_person_to_space,
    can_delete_person,
    can_edit_person,
    can_write_private,
    visible_spaces,
)
from people.models import ContactMethod, MemoryAid, Note, Person, Tag
from spaces.models import Space

BASIC_FIELDS = ("name", "how_we_met", "work")
OWNER_ONLY_FIELDS = ("tags", "contact_methods")


def create_me_person(user, name: str) -> Person:
    """Create the person that represents `user` in their own book."""
    return Person.objects.create(owner=user, account=user, name=name)


@transaction.atomic
def create_person(access: Access, data: dict[str, Any]) -> Person:
    """Add someone to the user's own book, optionally straight into some spaces."""
    if access.read_only or (access.is_space_limited and not data.get("space_ids")):
        raise PermissionDenied("This access can't add people.")
    person = Person(owner=access.user)
    _apply_basic(person, data)
    person.full_clean()
    person.save()
    _set_tags(person, data.get("tags", []))
    _set_contact_methods(person, data.get("contact_methods", []))
    for space in _spaces(access, data.get("space_ids", [])):
        if not can_add_person_to_space(access, person, space):
            raise PermissionDenied(f"You can't add people to {space.name}.")
        space.people.add(person, through_defaults={"added_by": access.user})
    return person


@transaction.atomic
def update_person(access: Access, person: Person, changes: dict[str, Any]) -> Person:
    """Change the fields in `changes`. Editors may fix basic details only."""
    if not can_edit_person(access, person):
        raise PermissionDenied("You can't edit this person.")
    if person.owner_id != access.user.pk and any(f in changes for f in OWNER_ONLY_FIELDS):
        raise PermissionDenied("Only the owner can change tags and contact details.")
    _apply_basic(person, changes)
    person.full_clean()
    person.save()
    if "tags" in changes:
        _set_tags(person, changes["tags"])
    if "contact_methods" in changes:
        _set_contact_methods(person, changes["contact_methods"])
    return person


def delete_person(access: Access, person: Person) -> None:
    if not can_delete_person(access, person):
        raise PermissionDenied("Only the owner can delete this person.")
    person.delete()


def _apply_basic(person: Person, data: dict[str, Any]) -> None:
    for field in BASIC_FIELDS:
        if field in data:
            setattr(person, field, data[field])
    if "birthday" in data:
        birthday = data["birthday"] or {}
        person.birth_day = birthday.get("day")
        person.birth_month = birthday.get("month")
        person.birth_year = birthday.get("year")


def _set_tags(person: Person, names: Iterable[str]) -> None:
    """Tags belong to the person's owner; reuse theirs, ignoring case."""
    tags = []
    for name in dict.fromkeys(n.strip() for n in names if n.strip()):
        tag = Tag.objects.filter(owner=person.owner, name__iexact=name).first()
        tags.append(tag or Tag.objects.create(owner=person.owner, name=name))
    person.tags.set(tags)


def _set_contact_methods(person: Person, methods: Iterable[dict[str, Any]]) -> None:
    person.contact_methods.all().delete()
    ContactMethod.objects.bulk_create(
        ContactMethod(person=person, position=position, **method)
        for position, method in enumerate(methods)
    )


def _spaces(access: Access, ids: Iterable) -> list[Space]:
    ids = set(ids)
    spaces = list(visible_spaces(access).filter(pk__in=ids))
    if len(spaces) != len(ids):
        raise ValidationError({"space_ids": "One of these spaces doesn't exist."})
    return spaces


# ---------------------------------------------------------------- private data


def save_note(access: Access, person: Person, body: str) -> Note | None:
    """Replace the user's notes on a person. An empty text removes them."""
    _check_can_write_private(access, person)
    if not body.strip():
        Note.objects.filter(author=access.user, person=person).delete()
        return None
    note, _ = Note.objects.update_or_create(
        author=access.user, person=person, defaults={"body": body}
    )
    return note


def create_memory_aid(access: Access, person: Person, data: dict[str, Any]) -> MemoryAid:
    _check_can_write_private(access, person)
    last = MemoryAid.objects.filter(author=access.user, person=person).order_by("-position")
    position = (last.values_list("position", flat=True).first() or 0) + 1
    return MemoryAid.objects.create(author=access.user, person=person, position=position, **data)


def update_memory_aid(access: Access, aid: MemoryAid, changes: dict[str, Any]) -> MemoryAid:
    _check_can_write_private(access, aid.person)
    for field in ("text", "pinned", "position"):
        if field in changes:
            setattr(aid, field, changes[field])
    aid.save()
    return aid


def delete_memory_aid(access: Access, aid: MemoryAid) -> None:
    _check_can_write_private(access, aid.person)
    aid.delete()


def _check_can_write_private(access: Access, person: Person) -> None:
    if not can_write_private(access, person):
        raise PermissionDenied("This access can't change private notes.")
