"""The calendar feed: what a calendar app gets when it asks with a private link."""

import datetime
import re

import pytest
from django.test import Client

from access.policy import Access
from calendars import services
from calendars.models import CalendarFeed
from calendars.schemas import CalendarFeedIn
from people.models import Person
from reminders.models import ReminderSettings
from spaces import services as space_services
from spaces.models import SpaceMembership
from tests.factories import TagFactory

NOW = datetime.datetime(2026, 10, 21, 9, 0, tzinfo=datetime.UTC)
NOT_FOUND = {"detail": "Not Found"}


@pytest.fixture
def clock(monkeypatch):
    """The server's time, as the feed sees it; set `clock.now` to move it."""

    class Clock:
        now = NOW

    clock = Clock()
    monkeypatch.setattr("calendars.api.timezone.now", lambda: clock.now)
    return clock


def link(user, spaces=None) -> str:
    """A new link of the user's, as the path a calendar app asks for."""
    ids = [space.pk for space in spaces] if spaces is not None else None
    _, token = services.create_feed(
        Access.for_user(user), CalendarFeedIn(name="Family", space_ids=ids)
    )
    return f"/api/calendars/feed/{token}.ics"


def born(person, day, month, year=None):
    Person.objects.filter(pk=person.pk).update(birth_day=day, birth_month=month, birth_year=year)


def summaries(text: str) -> list[str]:
    return re.findall(r"^SUMMARY:(.*)\r$", text, re.M)


def everyone_born(world):
    for person in (
        world.emma,
        world.oskar,
        world.ines,
        world.tom,
        world.ola,
        world.jin,
        world.yuki,
    ):
        born(person, 5, 11)
    born(Person.objects.get(account=world.ela), 5, 11)  # her own Me: never in her feed


def test_the_feed_lists_birthdays_for_the_next_12_months(world, clock):
    born(world.oskar, 20, 10, 1991)  # 35 on 20 October 2026: in the past already, so next year
    born(world.ines, 3, 1)
    born(world.emma, 20, 10)

    response = Client().get(link(world.ela))

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/calendar")
    assert response["Cache-Control"] == "private, max-age=3600"
    text = response.content.decode()
    assert summaries(text) == ["🎂 Ines's birthday", "🎂 Emma's birthday", "🎂 Oskar turns 36"]
    assert "DTSTART;VALUE=DATE:20270103\r\n" in text
    assert "DTSTART;VALUE=DATE:20271020\r\n" in text
    assert "X-WR-CALNAME:FolkBook · Family\r\n" in text


def test_a_birthday_today_is_in_the_feed(world, clock):
    born(world.oskar, 21, 10, 1990)

    text = Client().get(link(world.ela)).content.decode()

    assert summaries(text) == ["🎂 Oskar turns 36"]
    assert "DTSTART;VALUE=DATE:20261021\r\n" in text


def test_29_february_falls_on_the_28th_in_a_common_year(world, clock):
    born(world.oskar, 29, 2)

    text = Client().get(link(world.ela)).content.decode()

    assert "DTSTART;VALUE=DATE:20270228\r\n" in text


def test_uids_are_stable_between_polls(world, clock):
    born(world.oskar, 5, 11)
    path = link(world.ela)

    first = Client().get(path).content.decode()
    second = Client().get(path).content.decode()

    uids = re.findall(r"^UID:(.*)\r$", first, re.M)
    assert uids == [f"birthday-{world.oskar.pk}-2026@folkbook"]
    assert uids == re.findall(r"^UID:(.*)\r$", second, re.M)


def test_today_is_the_owners_own_date(world, clock):
    ReminderSettings.objects.create(user=world.ela, time_zone="Pacific/Kiritimati")  # UTC+14
    clock.now = datetime.datetime(2026, 10, 19, 23, 30, tzinfo=datetime.UTC)  # 20 Oct there
    born(world.oskar, 19, 10)

    text = Client().get(link(world.ela)).content.decode()

    # Already past for Ela, though not yet for the server: next year's.
    assert "DTSTART;VALUE=DATE:20271019\r\n" in text
    assert "DTSTART;VALUE=DATE:20261019" not in text


def test_another_users_people_never_appear(world, clock):
    everyone_born(world)

    text = Client().get(link(world.ela)).content.decode()

    names = sorted(summary.split(" ", 1)[1] for summary in summaries(text))
    # Hackathon 2026 is shared with Ela; Jin and Yuki aren't hers to see; never her own Me.
    assert names == [
        "Emma's birthday",
        "Ines's birthday",
        "Ola's birthday",
        "Oskar's birthday",
        "Tom's birthday",
    ]


def test_a_limited_link_shows_only_its_spaces(world, clock):
    everyone_born(world)

    text = Client().get(link(world.ela, spaces=[world.climbing])).content.decode()

    assert summaries(text) == ["🎂 Ines's birthday", "🎂 Oskar's birthday"]


def test_a_link_whose_spaces_are_gone_shows_nobody(world, clock):
    everyone_born(world)
    path = link(world.ela, spaces=[world.climbing])
    space_services.delete_space(Access.for_user(world.ela), world.climbing)

    text = Client().get(path).content.decode()

    assert "BEGIN:VEVENT" not in text


def test_someone_you_cant_see_any_more_drops_out(world, clock):
    everyone_born(world)
    path = link(world.ela)
    SpaceMembership.objects.filter(space=world.hackathon, user=world.ela).delete()

    text = Client().get(path).content.decode()

    assert "Tom" not in text and "Ola" not in text


def test_private_details_never_appear(world, clock):
    everyone_born(world)
    world.oskar.tags.add(TagFactory(owner=world.ela, name="Route setter"))

    text = Client().get(link(world.ela)).content.decode()

    for private in ("Tuesday routes", "Kid: Arda", "+46 70 555 12 90", "Route setter", "belay"):
        assert private not in text


def test_unknown_revoked_or_disabled_is_404(world, clock):
    path = link(world.ela)
    client = Client()

    unknown = client.get("/api/calendars/feed/fb_cal_" + "x" * 32 + ".ics")
    assert (unknown.status_code, unknown.json()) == (404, NOT_FOUND)

    world.ela.is_active = False
    world.ela.save()
    assert client.get(path).status_code == 404

    world.ela.is_active = True
    world.ela.save()
    assert client.get(path).status_code == 200
    CalendarFeed.objects.all().delete()
    assert client.get(path).status_code == 404


def test_polling_records_last_use_at_most_once_a_minute(world, clock):
    path = link(world.ela)
    client = Client()

    client.get(path)
    assert CalendarFeed.objects.get().last_fetched_at == NOW

    clock.now = NOW + datetime.timedelta(seconds=30)
    client.get(path)
    assert CalendarFeed.objects.get().last_fetched_at == NOW

    clock.now = NOW + datetime.timedelta(seconds=61)
    client.get(path)
    assert CalendarFeed.objects.get().last_fetched_at == clock.now
