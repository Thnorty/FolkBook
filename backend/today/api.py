"""What the Today screen needs that no other endpoint gives (screens 1e, 1f)."""

import datetime
from uuid import UUID

from django.utils import timezone
from ninja import Field, Query, Router, Schema, Status

from access.policy import visible_memory_aids
from core.api import access_for
from people.api import people_for
from today.birthdays import upcoming_birthdays
from today.schemas import BirthdayOut, RememberOut

router = Router(tags=["today"])


class BirthdayParams(Schema):
    today: datetime.date | None = None  # the user's own date (time zones)
    days: int = Field(7, ge=0, le=60)


@router.get("/birthdays", response=list[BirthdayOut])
def list_birthdays(request, params: Query[BirthdayParams]):
    """Birthdays of people you can see, from today to `days` ahead. Not your own."""
    access = access_for(request)
    people = people_for(access).exclude(account=access.user)
    return upcoming_birthdays(people, params.today or timezone.localdate(), params.days)


@router.get("/remember", response={200: RememberOut, 204: None})
def remember(request, skip: UUID | None = None):
    """One of your memory aids at random; `skip` the one just shown. 204 if you have none."""
    aids = visible_memory_aids(access_for(request)).select_related("person").order_by("?")
    # With only one, show it again rather than nothing.
    aid = (skip and aids.exclude(pk=skip).first()) or aids.first()
    return Status(200, {"aid": aid, "person": aid.person}) if aid else Status(204, None)
