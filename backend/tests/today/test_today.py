"""Today's own endpoints: birthdays coming up, a memory aid to remember, recent people."""

import datetime

import pytest

from people.models import Person
from tests.factories import MemoryAidFactory, PersonFactory, UserFactory
from today.birthdays import next_birthday

pytestmark = pytest.mark.django_db

TODAY = datetime.date(2026, 9, 22)


@pytest.mark.parametrize(
    ("day", "month", "today", "expected"),
    [
        (22, 9, TODAY, datetime.date(2026, 9, 22)),  # today counts
        (25, 9, TODAY, datetime.date(2026, 9, 25)),
        (21, 9, TODAY, datetime.date(2027, 9, 21)),  # just passed: next year
        (2, 1, datetime.date(2026, 12, 30), datetime.date(2027, 1, 2)),  # over new year
        (29, 2, datetime.date(2026, 2, 1), datetime.date(2026, 2, 28)),  # no 29th this year
        (29, 2, datetime.date(2028, 2, 1), datetime.date(2028, 2, 29)),
    ],
)
def test_next_birthday(day, month, today, expected):
    assert next_birthday(day, month, today) == expected


def birthdays(client, **params) -> list[tuple[str, str, int | None]]:
    response = client.get("/today/birthdays", today=TODAY.isoformat(), **params)
    return [(b["person"]["name"], b["on"], b["turns"]) for b in response.json()]


def test_birthdays_in_the_coming_week_soonest_first(api):
    ela = UserFactory(name="Ela")
    PersonFactory(owner=ela, name="Tom", birth_day=24, birth_month=9, birth_year=1995)
    PersonFactory(owner=ela, name="Selin", birth_day=22, birth_month=9, birth_year=1992)
    PersonFactory(owner=ela, name="Later", birth_day=30, birth_month=9)
    PersonFactory(owner=ela, name="Passed", birth_day=21, birth_month=9)
    PersonFactory(owner=ela, name="Unknown")
    client = api.login(ela)

    assert birthdays(client) == [("Selin", "2026-09-22", 34), ("Tom", "2026-09-24", 31)]
    assert ("Later", "2026-09-30", None) in birthdays(client, days=8)


def test_birthdays_leave_out_your_own_and_people_you_cant_see(api, world):
    for someone in (world.ela.me, world.oskar, world.jin):  # Jin is Defne's, unshared
        Person.objects.filter(pk=someone.pk).update(birth_day=23, birth_month=9)

    names = [name for name, *_ in birthdays(api.login(world.ela))]

    assert names == ["Oskar"]


def test_birthdays_reject_a_long_window(api):
    response = api.login(UserFactory()).get("/today/birthdays", days=365)

    assert response.status_code == 422


def test_remember_shows_one_of_your_own_memory_aids(api, world):
    MemoryAidFactory(person=world.oskar, author=world.deniz, text="Deniz's")
    client = api.login(world.ela)
    [ela_aid] = world.oskar.memory_aids.filter(author=world.ela)

    body = client.get("/today/remember").json()

    assert body["aid"]["id"] == str(ela_aid.pk)
    assert body["person"] == {"id": str(world.oskar.pk), "name": "Oskar"}


def test_remember_skips_the_one_just_shown_when_there_are_others(api):
    ela = UserFactory()
    emma = PersonFactory(owner=ela, name="Emma")
    first, second = MemoryAidFactory(person=emma), MemoryAidFactory(person=emma)
    client = api.login(ela)

    shown = {client.get("/today/remember", skip=str(first.pk)).json()["aid"]["id"] for _ in "123"}
    alone = api.login(ela).get("/today/remember", skip=str(second.pk)).json()

    assert shown == {str(second.pk)}
    assert alone["aid"]["id"] == str(first.pk)


def test_remember_is_empty_without_memory_aids(api):
    assert api.login(UserFactory()).get("/today/remember").status_code == 204


def test_recently_added_people_in_your_own_book(api, world):
    old = PersonFactory(owner=world.ela, name="Old")
    Person.objects.filter(pk=old.pk).update(
        created_at=datetime.datetime(2020, 1, 1, tzinfo=datetime.UTC)
    )
    newest = PersonFactory(owner=world.ela, name="Newest")

    response = api.login(world.ela).get("/people", recent=True)

    names = [person["name"] for person in response.json()["items"]]
    assert names[0] == "Newest" and "Old" not in names
    assert "Tom" not in names  # shared with Ela, not in her own book
    assert response.json()["items"][0]["added_at"].startswith(str(newest.created_at.date()))
