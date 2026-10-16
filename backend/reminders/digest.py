"""The reminder email (screen 6a): people it's time to get in touch with, and birthdays
coming up. Daily or weekly, at 08:00 in the user's own time zone; only when there's
something in it."""

import datetime
from dataclasses import dataclass
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings

from access.policy import Access, visible_people
from accounts.models import User
from reminders import links
from reminders.models import ReminderSettings
from reminders.nudges import Nudge, due_nudges
from today.birthdays import Birthday, upcoming_birthdays

DIGEST_HOUR = 8
# More than this and the email gets long; the rest are on Today.
MAX_PEOPLE = 10
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@dataclass(frozen=True)
class Digest:
    on: datetime.date
    weekly: bool
    nudges: list[Nudge]
    birthdays: list[Birthday]

    @property
    def empty(self) -> bool:
        return not self.nudges and not self.birthdays


def time_zone(prefs: ReminderSettings) -> ZoneInfo:
    try:
        return ZoneInfo(prefs.time_zone or settings.TIME_ZONE)
    except ZoneInfoNotFoundError:
        return ZoneInfo(settings.TIME_ZONE)


def local_today(prefs: ReminderSettings) -> datetime.date:
    return datetime.datetime.now(time_zone(prefs)).date()


def digest_due(prefs: ReminderSettings, now: datetime.datetime) -> datetime.date | None:
    """The user's own date if their digest should go out now (and hasn't yet), else None."""
    if prefs.digest == ReminderSettings.Digest.OFF:
        return None
    local = now.astimezone(time_zone(prefs))
    weekly = prefs.digest == ReminderSettings.Digest.WEEKLY
    if local.hour < DIGEST_HOUR or (weekly and local.weekday() != prefs.digest_weekday):
        return None
    return None if prefs.last_digest_on == local.date() else local.date()


def digest_for(user: User, on: datetime.date, prefs: ReminderSettings) -> Digest:
    """What the email holds on `on`, through the permission layer like everything else.

    Daily: birthdays exactly `birthdays_days_before` days ahead. Weekly: the 7 days from
    then, so each birthday comes up once either way.
    """
    access = Access.for_user(user)
    weekly = prefs.digest == ReminderSettings.Digest.WEEKLY
    birthdays = []
    if prefs.birthdays_days_before is not None:
        start = on + datetime.timedelta(days=prefs.birthdays_days_before)
        people = visible_people(access).exclude(account=user)
        birthdays = upcoming_birthdays(people, start, 6 if weekly else 0)
    return Digest(on, weekly, due_nudges(access, on), birthdays)


def email(user: User, digest: Digest, prefs: ReminderSettings) -> dict:
    """Subject, preview, context and headers for `mail.services.send`."""
    url = settings.FOLKBOOK_URL
    unsubscribe = links.unsubscribe_token(user)
    shown = digest.nudges[:MAX_PEOPLE]
    return {
        "subject": _subject(digest),
        "preview": _preview(digest),
        "context": {
            "heading": _heading(digest),
            "dated": _dated(digest),
            "people": [_person(user, nudge, prefs, url) for nudge in shown],
            "more": len(digest.nudges) - len(shown),
            "birthdays": [_birthday(birthday, digest.on) for birthday in digest.birthdays],
            "birthdays_title": "Birthdays coming up" if digest.weekly else "Birthdays",
            "today_url": f"{url}/",
            "settings_url": f"{url}/settings/reminders",
            "unsubscribe_url": f"{url}/unsubscribe/{unsubscribe}",
            "schedule": _schedule(prefs),
            "memory_aids": prefs.include_memory_aids,
        },
        # One-click unsubscribe from the email app itself (RFC 8058).
        "headers": {
            "List-Unsubscribe": f"<{url}/api/email-links/unsubscribe/{unsubscribe}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    }


def _person(user: User, nudge: Nudge, prefs: ReminderSettings, url: str) -> dict:
    person = nudge.person
    since = (
        f"Last talked {ago(nudge.days_since)}" if nudge.last_talked_on else "No talks logged yet"
    )
    return {
        "name": person.name,
        "initials": "".join(word[0] for word in person.name.split()[:2]).upper(),
        "line": f"{since} · {every(nudge.interval_days)}",
        "remember": nudge.hint if prefs.include_memory_aids else "",
        "open_url": f"{url}/people/{person.pk}",
        "talked_url": f"{url}/we-talked/{links.talked_token(user, person)}",
    }


def _birthday(birthday: Birthday, on: datetime.date) -> str:
    when = (
        "today" if birthday.on == on else f"{WEEKDAYS[birthday.on.weekday()]} {_day(birthday.on)}"
    )
    turns = f", turns {birthday.turns}" if birthday.turns else ""
    return f"{birthday.person.name} — {when}{turns}"


def _subject(digest: Digest) -> str:
    period = "this week" if digest.weekly else "today"
    count = len(digest.nudges)
    if count:
        return f"{count} {'person' if count == 1 else 'people'} to catch up with {period}"
    if len(digest.birthdays) == 1:
        return f"{_first(digest.birthdays[0].person.name)}'s birthday is coming up"
    if digest.birthdays:
        return f"{len(digest.birthdays)} birthdays coming up"
    return "No one to catch up with right now"


def _heading(digest: Digest) -> str:
    return _subject(digest) if digest.nudges else "Birthdays coming up"


def _preview(digest: Digest) -> str:
    names = _and([_first(nudge.person.name) for nudge in digest.nudges[:3]])
    if len(digest.nudges) > 3:
        names = f"{names} and {len(digest.nudges) - 3} more"
    if len(digest.birthdays) == 1:
        birthday = digest.birthdays[0]
        coming = f"{_first(birthday.person.name)}'s birthday on {WEEKDAYS[birthday.on.weekday()]}"
    else:
        coming = f"{len(digest.birthdays)} birthdays" if digest.birthdays else ""
    if names and coming:
        return f"{names} — plus {coming}."
    return f"{names or coming}."


def _dated(digest: Digest) -> str:
    on = digest.on
    return f"Week of {_day(on)}" if digest.weekly else f"{WEEKDAYS[on.weekday()]} {_day(on)}"


def _schedule(prefs: ReminderSettings) -> str:
    if prefs.digest == ReminderSettings.Digest.WEEKLY:
        return f"every {WEEKDAYS[prefs.digest_weekday]} at {DIGEST_HOUR:02}:00"
    return f"every day at {DIGEST_HOUR:02}:00"


def ago(days: int) -> str:
    """ "yesterday", "3 weeks ago", "4 months ago", "a year ago"."""
    if days < 2:
        return "today" if days < 1 else "yesterday"
    if days < 14:
        return f"{days} days ago"
    if days < 60:
        return f"{days // 7} weeks ago"
    if days < 365:
        return f"{days // 30} months ago"
    return "a year ago" if days < 730 else f"{days // 365} years ago"


def every(days: int) -> str:
    """ "every 2 months", like the profile says it (`intervalLabel` in the app)."""
    for size, unit in ((365, "year"), (30, "month"), (7, "week")):
        if days % size == 0:
            count = days // size
            return f"every {unit}" if count == 1 else f"every {count} {unit}s"
    return "every day" if days == 1 else f"every {days} days"


def _day(on: datetime.date) -> str:
    return f"{on.day} {on:%B}"


def _first(name: str) -> str:
    return name.split()[0] if name.split() else name


def _and(words: list[str]) -> str:
    """ "Deniz, Burak and Sofia"; "" for nobody."""
    return " and ".join(filter(None, [", ".join(words[:-1]), *words[-1:]]))
