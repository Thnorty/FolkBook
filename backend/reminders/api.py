import datetime
from uuid import UUID

from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router
from ninja.security import django_auth

from access.policy import Access, visible_keep_in_touch, visible_people
from core.api import access_for
from people.models import Person
from reminders import services
from reminders.nudges import due_nudges, next_nudge_on, settings_for
from reminders.schemas import (
    KeepInTouchOut,
    KeepInTouchSchema,
    NudgeOut,
    ReminderSettingsSchema,
)

router = Router(tags=["reminders"])


@router.get("/due", response=list[NudgeOut])
def list_due(request, today: datetime.date | None = None):
    """Who it's time to get in touch with. `today`: the user's own date (time zones)."""
    return due_nudges(access_for(request), today or timezone.localdate())


# Nudges for the whole book are the account's: the login cookie only, never an API key.
@router.get("/settings", response=ReminderSettingsSchema, auth=django_auth)
def get_settings(request):
    return settings_for(access_for(request).user)


@router.put("/settings", response=ReminderSettingsSchema, auth=django_auth)
def save_settings(request, payload: ReminderSettingsSchema):
    return services.save_settings(access_for(request), payload.model_dump())


def keep_in_touch_out(access: Access, person: Person) -> KeepInTouchOut:
    setting = visible_keep_in_touch(access).filter(person=person).first()
    return KeepInTouchOut(
        **KeepInTouchSchema.model_validate(setting or {}).model_dump(),
        default_interval_days=settings_for(access.user).default_interval_days,
        next_nudge_on=next_nudge_on(access, person),
    )


@router.get("/{uuid:person_id}", response=KeepInTouchOut)
def get_keep_in_touch(request, person_id: UUID):
    """The user's own setting (defaults when there is none yet), and when they're next due."""
    access = access_for(request)
    return keep_in_touch_out(access, get_object_or_404(visible_people(access), pk=person_id))


@router.put("/{uuid:person_id}", response=KeepInTouchOut)
def save_keep_in_touch(request, person_id: UUID, payload: KeepInTouchSchema):
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    services.save_keep_in_touch(access, person, payload.model_dump())
    return keep_in_touch_out(access, person)
