"""Birthdays coming up, for Today."""

import calendar
import datetime
from dataclasses import dataclass

from django.db.models import QuerySet

from people.models import Person


@dataclass(frozen=True)
class Birthday:
    person: Person
    on: datetime.date
    turns: int | None  # None when the year is unknown


def next_birthday(day: int, month: int, today: datetime.date) -> datetime.date:
    """The next time this day and month comes round, today included.

    29 February is kept on 28 February in years without it.
    """
    for year in (today.year, today.year + 1):
        on = datetime.date(year, month, min(day, calendar.monthrange(year, month)[1]))
        if on >= today:
            return on
    raise AssertionError("unreachable: next year's date is always after today")


def upcoming_birthdays(people: QuerySet[Person], today: datetime.date, days: int) -> list[Birthday]:
    """Birthdays from today to `days` days ahead, soonest first."""
    until = today + datetime.timedelta(days=days)
    found = []
    for person in people.filter(birth_day__isnull=False, birth_month__isnull=False):
        on = next_birthday(person.birth_day, person.birth_month, today)
        if on <= until:
            turns = on.year - person.birth_year if person.birth_year else None
            found.append(Birthday(person, on, turns))
    return sorted(found, key=lambda birthday: (birthday.on, birthday.person.name))
