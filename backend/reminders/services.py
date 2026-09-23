"""Keep-in-touch settings. Private to the user; writes check the permission layer."""

from typing import Any

from django.core.exceptions import PermissionDenied

from access.policy import Access, can_write_private
from people.models import Person
from reminders.models import KeepInTouch


def save_keep_in_touch(access: Access, person: Person, data: dict[str, Any]) -> KeepInTouch:
    if not can_write_private(access, person):
        raise PermissionDenied("This access can't change reminders.")
    setting, _ = KeepInTouch.objects.update_or_create(
        user=access.user, person=person, defaults=data
    )
    return setting
