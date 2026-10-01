"""Keep-in-touch settings. Private to the user; writes check the permission layer."""

from typing import Any

from django.core.exceptions import PermissionDenied

from access.policy import Access, can_write_private
from people.models import Person
from reminders.models import KeepInTouch, ReminderSettings


def save_keep_in_touch(access: Access, person: Person, data: dict[str, Any]) -> KeepInTouch:
    if not can_write_private(access, person):
        raise PermissionDenied("This access can't change reminders.")
    setting, _ = KeepInTouch.objects.update_or_create(
        user=access.user, person=person, defaults=data
    )
    return setting


def save_settings(access: Access, data: dict[str, Any]) -> ReminderSettings:
    if access.read_only:
        raise PermissionDenied("This access can't change settings.")
    settings, _ = ReminderSettings.objects.update_or_create(user=access.user, defaults=data)
    return settings
