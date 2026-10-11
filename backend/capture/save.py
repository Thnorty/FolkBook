"""Save a reviewed capture at once, and undo all of it.

Every part goes through the usual services, so it's checked like anything typed in a form.
One transaction: when one part isn't allowed, nothing is saved.
"""

import datetime

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.http import Http404
from django.utils import timezone

from access.policy import Access, can_edit_person, visible_people
from capture.draft import space_for
from capture.models import Capture
from capture.prompt import ME
from capture.schemas import ChangesIn, SaveIn
from core.api import Conflict
from interactions.models import Interaction
from interactions.services import log_interaction
from people.models import MemoryAid, Person
from people.services import create_memory_aid, create_person, delete_person, update_person
from relationships.models import Relationship
from relationships.services import create_relationship, current_links

FIELDS = ("how_we_met", "work", "birthday")
KEPT_FOR = datetime.timedelta(days=1)


@transaction.atomic
def save_capture(access: Access, data: SaveIn) -> tuple[Capture, list[Person], list[Person]]:
    """Returns the capture, the people it created and the people it matched."""
    if access.read_only:
        raise PermissionDenied("This access can't add people.")
    space = space_for(access, data.space_id)
    capture = Capture(owner=access.user)
    people: dict[str, Person] = {}
    created, matched = [], []

    for new in data.new_people:
        person = create_person(
            access,
            new.model_dump(exclude={"ref"}) | {"space_ids": [space.pk] if space else []},
        )
        _remember(people, new.ref, person)
        created.append(person)
        capture.people.append(str(person.pk))
    for existing in data.existing_people:
        person = visible_people(access).filter(pk=existing.person_id).first()
        if person is None:
            raise Http404("No such person.")
        _remember(people, existing.ref, person)
        matched.append(person)
        capture.changes += _change(access, person, existing.changes)

    for connection in data.connections:
        a, b = _person(access, people, connection.a), _person(access, people, connection.b)
        if current_links(access.user, connection.type, a, b).exists():
            continue  # a capture often restates what you know: keep the link you have
        link = create_relationship(
            access,
            a,
            b,
            # As the card said; the policy refuses it unless both people are in the space.
            space if connection.in_space else None,
            {
                "type": connection.type,
                "label": connection.label,
                "parent_type": connection.parent_type or "",
            },
        )
        capture.relationships.append(str(link.pk))
    for aid in data.memory_aids:
        person = _person(access, people, aid.about, me=False)
        capture.memory_aids.append(str(create_memory_aid(access, person, {"text": aid.text}).pk))
    for entry in data.entries:
        person = _person(access, people, entry.about, me=False)
        interaction = log_interaction(
            access,
            person,
            {
                "kind": entry.kind,
                "occurred_on": entry.date,
                "label": entry.label,
                "note": entry.note,
            },
        )
        capture.interactions.append(str(interaction.pk))

    capture.save()
    return capture, created, matched


@transaction.atomic
def undo_capture(access: Access, capture: Capture) -> dict:
    """Delete what the capture made and put changed fields back, unless they've been
    changed again since: the newer value stays."""
    capture = Capture.objects.select_for_update().get(pk=capture.pk)
    if capture.owner_id != access.user.pk or access.read_only:
        raise Http404("No such capture.")
    if capture.undone_at is not None:
        raise Conflict("This was already undone.")
    removed = {
        "entries": Interaction.objects.filter(
            pk__in=capture.interactions, author=access.user
        ).delete()[0],
        "memory_aids": MemoryAid.objects.filter(
            pk__in=capture.memory_aids, author=access.user
        ).delete()[0],
        "connections": Relationship.objects.filter(
            pk__in=capture.relationships, owner=access.user
        ).delete()[0],
        "people": 0,
    }
    # Deleted as from their page: anyone who wrote about them meanwhile keeps a copy.
    for person in Person.objects.filter(
        pk__in=capture.people, owner=access.user, deleted_at__isnull=True
    ):
        delete_person(access, person)
        removed["people"] += 1
    restored = sum(_put_back(access, change) for change in capture.changes)
    capture.undone_at = timezone.now()
    capture.save(update_fields=["undone_at", "updated_at"])
    return {"removed": removed, "restored": restored}


def forget_old_captures() -> int:
    """Undo is offered right after saving; a day later the record goes."""
    cutoff = timezone.now() - KEPT_FOR
    return Capture.objects.filter(created_at__lt=cutoff).delete()[0]


def _remember(people: dict[str, Person], ref: str, person: Person) -> None:
    if ref in people or ref == ME:
        raise ValidationError({"ref": f"“{ref}” is used twice."})
    people[ref] = person


def _person(access: Access, people: dict[str, Person], ref: str, me: bool = True) -> Person:
    if me and ref == ME:
        return access.user.me
    if ref not in people:
        raise ValidationError({"ref": f"Nobody in this capture is “{ref}”."})
    return people[ref]


def _value(person: Person, field: str):
    if field == "tags":
        return sorted((tag.name for tag in person.tags.all()), key=str.casefold)
    if field == "birthday":
        if person.birth_day is None:
            return None
        return {"day": person.birth_day, "month": person.birth_month, "year": person.birth_year}
    return getattr(person, field)


def _change(access: Access, person: Person, changes: ChangesIn) -> list[dict]:
    """Apply the approved changes; return each as {person, field, before, after}."""
    wanted = {
        field: value
        for field, value in changes.model_dump(exclude_unset=True, include=set(FIELDS)).items()
        if value is not None  # a capture adds what it read; it never clears a field
    }
    if changes.add_tags:
        wanted["tags"] = [*_value(person, "tags"), *changes.add_tags]
    if not wanted:
        return []
    before = {field: _value(person, field) for field in wanted}
    update_person(access, person, wanted)
    person.refresh_from_db()
    return [
        {"person": str(person.pk), "field": field, "before": before[field], "after": after}
        for field in wanted
        if (after := _value(person, field)) != before[field]
    ]


def _put_back(access: Access, change: dict) -> bool:
    person = visible_people(access).filter(pk=change["person"]).first()
    field = change["field"]
    if person is None or not can_edit_person(access, person):
        return False
    if _value(person, field) != change["after"]:
        return False  # changed again since: the newer value stays
    update_person(access, person, {field: change["before"]})
    return True
