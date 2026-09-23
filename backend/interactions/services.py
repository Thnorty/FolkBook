"""Timeline entries. Private to their author; every write checks the permission layer."""

from typing import Any

from django.core.exceptions import PermissionDenied

from access.policy import Access, can_write_private
from interactions.models import Interaction
from people.models import Person

EDITABLE_FIELDS = ("kind", "label", "occurred_on", "note")


def log_interaction(access: Access, person: Person, data: dict[str, Any]) -> Interaction:
    _check(access, person)
    interaction = Interaction(author=access.user, person=person, **data)
    interaction.full_clean()
    interaction.save()
    return interaction


def update_interaction(
    access: Access, interaction: Interaction, changes: dict[str, Any]
) -> Interaction:
    _check(access, interaction.person)
    for field in EDITABLE_FIELDS:
        if field in changes:
            setattr(interaction, field, changes[field])
    interaction.full_clean()
    interaction.save()
    return interaction


def delete_interaction(access: Access, interaction: Interaction) -> None:
    _check(access, interaction.person)
    interaction.delete()


def _check(access: Access, person: Person) -> None:
    if not can_write_private(access, person):
        raise PermissionDenied("This access can't change the timeline.")
