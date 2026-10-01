"""Who it's time to get in touch with: the keep-in-touch nudges on Today.

A person is due once the time since you last talked (your latest timeline entry)
reaches their interval: their own, or your default. Logging anything resets it.
Snoozed people wait until the snooze ends; stopped ones never come up. Someone you've
never talked to counts from when you started keeping in touch with them (the
setting) or when they came into your book.
"""

import datetime
from dataclasses import dataclass

from django.db.models import OuterRef, Prefetch, QuerySet, Subquery

from access.policy import (
    Access,
    visible_interactions,
    visible_keep_in_touch,
    visible_memory_aids,
    visible_people,
)
from people.models import Person
from reminders.models import ReminderSettings


@dataclass(frozen=True)
class Nudge:
    person: Person
    interval_days: int
    days_since: int
    last_talked_on: datetime.date | None
    hint: str  # a pinned memory aid, e.g. "Said you'd help with the move"


def settings_for(user) -> ReminderSettings:
    """The user's settings, or the defaults if they never changed them."""
    return ReminderSettings.objects.filter(user=user).first() or ReminderSettings(user=user)


def _with_state(access: Access) -> QuerySet[Person]:
    """Visible people (not your own Me) with what deciding a nudge needs."""
    setting = visible_keep_in_touch(access).filter(person=OuterRef("pk"))
    last_talked = (
        visible_interactions(access)
        .filter(person=OuterRef("pk"))
        .order_by("-occurred_on")
        .values("occurred_on")
    )
    return (
        visible_people(access)
        .exclude(account=access.user)
        .annotate(
            last_talked_on=Subquery(last_talked[:1]),
            own_interval=Subquery(setting.values("interval_days")[:1]),
            snoozed_until=Subquery(setting.values("snoozed_until")[:1]),
            stopped=Subquery(setting.values("stopped")[:1]),
            tracked_since=Subquery(setting.values("created_at")[:1]),
        )
    )


def _interval(person: Person, defaults: ReminderSettings) -> int | None:
    if not defaults.nudges_on or person.stopped:
        return None
    return person.own_interval or defaults.default_interval_days


def _since(person: Person) -> datetime.date:
    return person.last_talked_on or (person.tracked_since or person.created_at).date()


def _due_on(person: Person, interval: int) -> datetime.date:
    due = _since(person) + datetime.timedelta(days=interval)
    return max(due, person.snoozed_until or due)


def due_nudges(access: Access, today: datetime.date) -> list[Nudge]:
    """Everyone due, most overdue (relative to their interval) first."""
    defaults = settings_for(access.user)
    if not defaults.nudges_on:
        return []
    people = _with_state(access).prefetch_related(
        Prefetch(
            "memory_aids",
            queryset=visible_memory_aids(access).filter(pinned=True),
            to_attr="pinned_aids",
        )
    )
    nudges = []
    for person in people:
        interval = _interval(person, defaults)
        if interval and _due_on(person, interval) <= today:
            days = (today - _since(person)).days
            hint = person.pinned_aids[0].text if person.pinned_aids else ""
            nudges.append(Nudge(person, interval, days, person.last_talked_on, hint))
    return sorted(nudges, key=lambda nudge: nudge.days_since / nudge.interval_days, reverse=True)


def next_nudge_on(access: Access, person: Person) -> datetime.date | None:
    """When this person comes up on Today next (a past date: they're due). None: never."""
    defaults = settings_for(access.user)
    state = _with_state(access).filter(pk=person.pk).first()
    interval = state and _interval(state, defaults)
    return _due_on(state, interval) if interval else None
