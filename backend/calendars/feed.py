"""What a calendar app gets for a private link: birthdays for the coming year."""

import datetime

from django.db.models import Q

from access.policy import Access, visible_people
from calendars.ics import Event, calendar
from calendars.models import CalendarFeed
from core.tokens import hash_token
from reminders.digest import time_zone
from reminders.nudges import settings_for
from today.birthdays import Birthday, upcoming_birthdays

AHEAD_DAYS = 365
# How often polling may record that the link was used.
FETCH_NOTE = datetime.timedelta(minutes=1)


def find_feed(token: str) -> CalendarFeed | None:
    """The link this token opens, if it's still there and its owner can sign in."""
    return (
        CalendarFeed.objects.select_related("owner")
        .filter(hashed=hash_token(token), owner__is_active=True)
        .first()
    )


def note_fetched(feed: CalendarFeed, now: datetime.datetime) -> None:
    """Record that a calendar asked, at most once a minute (one UPDATE, no read first)."""
    stale = Q(last_fetched_at__isnull=True) | Q(last_fetched_at__lte=now - FETCH_NOTE)
    CalendarFeed.objects.filter(pk=feed.pk).filter(stale).update(last_fetched_at=now)


def feed_text(feed: CalendarFeed, now: datetime.datetime) -> str:
    """The whole calendar: the birthdays this link may show, from the owner's own today."""
    owner = feed.owner
    space_ids = list(feed.spaces.values_list("pk", flat=True)) if feed.limited else None
    # Names and dates only: never notes, memory aids or the timeline.
    access = Access.limited(owner, space_ids=space_ids, include_private=False, read_only=True)
    people = visible_people(access).exclude(account=owner)
    today = now.astimezone(time_zone(settings_for(owner))).date()
    birthdays = upcoming_birthdays(people, today, AHEAD_DAYS)
    return calendar(feed.name, [_event(birthday) for birthday in birthdays], now)


def _event(birthday: Birthday) -> Event:
    person = birthday.person
    summary = (
        f"{person.name} turns {birthday.turns}" if birthday.turns else f"{person.name}'s birthday"
    )
    return Event(
        uid=f"birthday-{person.pk}-{birthday.on.year}@folkbook",
        day=birthday.on,
        summary=f"🎂 {summary}",
    )
