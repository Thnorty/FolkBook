"""Keep-in-touch nudges: who's due, and the settings behind them."""

import datetime

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from access.policy import Access
from people.models import Person
from reminders.models import KeepInTouch, ReminderSettings
from reminders.nudges import due_nudges
from tests.factories import (
    InteractionFactory,
    KeepInTouchFactory,
    MemoryAidFactory,
    PersonFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db

TODAY = datetime.date(2026, 9, 22)


def days_ago(days: int) -> datetime.date:
    return TODAY - datetime.timedelta(days=days)


@pytest.fixture
def ela():
    return UserFactory(name="Ela")


def at(day: datetime.date) -> datetime.datetime:
    return datetime.datetime.combine(day, datetime.time(), datetime.UTC)


def person(owner, name: str, *, added_days_ago: int = 400) -> Person:
    """Someone who came into the book a while ago (nudges count from then)."""
    someone = PersonFactory(owner=owner, name=name)
    Person.objects.filter(pk=someone.pk).update(created_at=at(days_ago(added_days_ago)))
    return Person.objects.get(pk=someone.pk)


def keep_in_touch(someone: Person, **fields) -> KeepInTouch:
    """A setting made when they came in: TODAY is fixed, the factory uses the real clock."""
    setting = KeepInTouchFactory(person=someone, **fields)
    KeepInTouch.objects.filter(pk=setting.pk).update(created_at=someone.created_at)
    setting.refresh_from_db()
    return setting


def due(user) -> list[str]:
    return [nudge.person.name for nudge in due_nudges(Access.for_user(user), TODAY)]


def test_due_once_the_interval_has_passed_since_you_last_talked(ela):
    deniz, emma = person(ela, "Deniz"), person(ela, "Emma")
    for someone in (deniz, emma):
        keep_in_touch(someone, interval_days=60)
    InteractionFactory(person=deniz, occurred_on=days_ago(60))
    InteractionFactory(person=emma, occurred_on=days_ago(59))

    assert due(ela) == ["Deniz"]


def test_logging_anything_resets_the_timer(ela):
    deniz = person(ela, "Deniz")
    keep_in_touch(deniz, interval_days=30)
    InteractionFactory(person=deniz, occurred_on=days_ago(90))
    InteractionFactory(person=deniz, occurred_on=days_ago(2), kind="message")

    assert due(ela) == []


def test_your_default_applies_to_people_without_their_own_interval(ela):
    person(ela, "Deniz")
    assert due(ela) == []  # no default: only people with their own interval

    ReminderSettings.objects.create(user=ela, default_interval_days=180)

    assert due(ela) == ["Deniz"]


def test_snoozed_people_wait_until_the_snooze_ends(ela):
    deniz = person(ela, "Deniz")
    setting = keep_in_touch(deniz, interval_days=30, snoozed_until=days_ago(-3))
    assert due(ela) == []

    setting.snoozed_until = TODAY
    setting.save()

    assert due(ela) == ["Deniz"]


def test_stopped_people_and_turned_off_nudges_never_come_up(ela):
    keep_in_touch(person(ela, "Deniz"), interval_days=30, stopped=True)
    keep_in_touch(person(ela, "Emma"), interval_days=30)
    assert due(ela) == ["Emma"]

    ReminderSettings.objects.create(user=ela, nudges_on=False)

    assert due(ela) == []


def test_someone_you_never_talked_to_counts_from_when_they_came_in(ela):
    keep_in_touch(person(ela, "New", added_days_ago=10), interval_days=30)
    keep_in_touch(person(ela, "Old", added_days_ago=40), interval_days=30)

    assert due(ela) == ["Old"]


def test_most_overdue_first(ela):
    for name, interval, talked in [("Twice", 30, 60), ("Thrice", 30, 90), ("Just", 60, 61)]:
        someone = person(ela, name)
        keep_in_touch(someone, interval_days=interval)
        InteractionFactory(person=someone, occurred_on=days_ago(talked))

    assert due(ela) == ["Thrice", "Twice", "Just"]


def test_your_own_me_is_never_due(ela):
    ReminderSettings.objects.create(user=ela, default_interval_days=1)
    Person.objects.filter(pk=ela.me.pk).update(created_at=at(days_ago(400)))

    assert due(ela) == []


def test_only_your_own_timeline_and_memory_aids_count(world):
    """Oskar is Ela's and in Climbing club, where Deniz is an editor."""
    Person.objects.filter(pk=world.oskar.pk).update(created_at=at(days_ago(400)))
    world.oskar.refresh_from_db()
    keep_in_touch(world.oskar, user=world.deniz, interval_days=30)
    InteractionFactory(person=world.oskar, author=world.ela, occurred_on=days_ago(1))
    MemoryAidFactory(person=world.oskar, author=world.ela, text="Ela's", pinned=True)
    MemoryAidFactory(person=world.oskar, author=world.deniz, text="Owes me a belay", pinned=True)

    [nudge] = due_nudges(Access.for_user(world.deniz), TODAY)

    assert nudge.person == world.oskar
    assert nudge.last_talked_on is None  # Ela's coffee isn't Deniz's
    assert nudge.hint == "Owes me a belay"


def test_working_it_out_takes_the_same_queries_however_many_people(ela):
    ReminderSettings.objects.create(user=ela, default_interval_days=30)
    person(ela, "One")
    with CaptureQueriesContext(connection) as few:
        due_nudges(Access.for_user(ela), TODAY)
    for index in range(10):
        someone = person(ela, f"Many {index}")
        InteractionFactory(person=someone, occurred_on=days_ago(40))
        MemoryAidFactory(person=someone, pinned=True)

    with CaptureQueriesContext(connection) as many:
        due_nudges(Access.for_user(ela), TODAY)

    assert len(many) == len(few)


# ---------------------------------------------------------------- API


def test_due_endpoint_uses_the_users_own_date(api, ela):
    deniz = person(ela, "Deniz")
    keep_in_touch(deniz, interval_days=30)
    InteractionFactory(person=deniz, occurred_on=days_ago(30))
    client = api.login(ela)

    response = client.get("/keep-in-touch/due", today=TODAY.isoformat())
    earlier = client.get("/keep-in-touch/due", today=days_ago(1).isoformat())

    assert response.json() == [
        {
            "person": {"id": str(deniz.pk), "name": "Deniz"},
            "interval_days": 30,
            "days_since": 30,
            "last_talked_on": days_ago(30).isoformat(),
            "hint": "",
        }
    ]
    assert earlier.json() == []


def test_settings_default_then_save(api, ela):
    client = api.login(ela)

    assert client.get("/keep-in-touch/settings").json() == {
        "nudges_on": True,
        "default_interval_days": None,
    }
    saved = client.put("/keep-in-touch/settings", {"nudges_on": False, "default_interval_days": 60})

    assert saved.json() == {"nudges_on": False, "default_interval_days": 60}
    assert api.login(UserFactory()).get("/keep-in-touch/settings").json()["nudges_on"] is True


def test_settings_reject_a_zero_interval(api, ela):
    response = api.login(ela).put("/keep-in-touch/settings", {"default_interval_days": 0})

    assert response.status_code == 422


def test_a_profile_says_when_they_come_up_next(api, ela):
    deniz = person(ela, "Deniz")
    keep_in_touch(deniz, interval_days=30)
    InteractionFactory(person=deniz, occurred_on=TODAY)
    client = api.login(ela)

    body = client.get(f"/keep-in-touch/{deniz.pk}").json()
    stopped = client.put(f"/keep-in-touch/{deniz.pk}", {"interval_days": 30, "stopped": True})

    assert body["next_nudge_on"] == (TODAY + datetime.timedelta(days=30)).isoformat()
    assert body["default_interval_days"] is None
    assert stopped.json()["next_nudge_on"] is None


def test_a_snooze_moves_the_next_nudge(api, ela):
    deniz = person(ela, "Deniz")
    keep_in_touch(deniz, interval_days=30)
    InteractionFactory(person=deniz, occurred_on=TODAY)

    body = (
        api.login(ela)
        .put(f"/keep-in-touch/{deniz.pk}", {"interval_days": 30, "snoozed_until": "2026-12-01"})
        .json()
    )

    assert body["next_nudge_on"] == "2026-12-01"
