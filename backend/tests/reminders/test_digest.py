"""The reminder email: when it goes, what's in it (and what never is), and its jobs."""

import datetime
from zoneinfo import ZoneInfo

import pytest
from django_tasks_db.models import DBTaskResult

from people.models import Person
from reminders import tasks
from reminders.digest import ago, digest_due, every, initials
from reminders.models import ReminderSettings
from tests.factories import MemoryAidFactory, PersonFactory, UserFactory
from tests.reminders.test_nudges import at, keep_in_touch, person

pytestmark = pytest.mark.django_db

MONDAY = datetime.date(2026, 9, 21)
ISTANBUL = ZoneInfo("Europe/Istanbul")  # UTC+3


def local(day: datetime.date, hour: int, minute: int = 0) -> datetime.datetime:
    return datetime.datetime.combine(day, datetime.time(hour, minute), ISTANBUL)


def prefs(**fields) -> ReminderSettings:
    return ReminderSettings(time_zone="Europe/Istanbul", **fields)


@pytest.mark.parametrize(
    ("setting", "now", "due"),
    [
        (prefs(), local(MONDAY, 8), MONDAY),  # weekly, Mondays at 08:00, their time
        (prefs(), local(MONDAY, 7, 59), None),
        (prefs(), local(MONDAY + datetime.timedelta(days=1), 9), None),  # Tuesday
        (
            prefs(digest_weekday=1),
            local(MONDAY + datetime.timedelta(days=1), 9),
            MONDAY.replace(day=22),
        ),
        (
            prefs(digest="daily"),
            local(MONDAY + datetime.timedelta(days=3), 8),
            MONDAY.replace(day=24),
        ),
        (prefs(digest="off"), local(MONDAY, 8), None),
        (prefs(last_digest_on=MONDAY), local(MONDAY, 20), None),  # already sent today
        # 23:30 on Sunday in UTC is already 02:30 Monday in Istanbul: still too early.
        (prefs(), datetime.datetime(2026, 9, 20, 23, 30, tzinfo=datetime.UTC), None),
        # No time zone saved: the server's (UTC).
        (ReminderSettings(), datetime.datetime(2026, 9, 21, 8, 0, tzinfo=datetime.UTC), MONDAY),
        (ReminderSettings(), local(MONDAY, 10), None),  # 07:00 UTC
    ],
)
def test_when_the_digest_goes_out(setting, now, due):
    assert digest_due(setting, now) == due


@pytest.mark.parametrize(
    ("days", "said"),
    [
        (0, "today"),
        (1, "yesterday"),
        (5, "5 days ago"),
        (21, "3 weeks ago"),
        (125, "4 months ago"),
        (400, "a year ago"),
        (1100, "3 years ago"),
    ],
)
def test_how_long_ago(days, said):
    assert ago(days) == said


@pytest.mark.parametrize(
    ("days", "said"),
    [
        (30, "every month"),
        (60, "every 2 months"),
        (7, "every week"),
        (365, "every year"),
        (10, "every 10 days"),
        (1, "every day"),
    ],
)
def test_how_often(days, said):
    assert every(days) == said


@pytest.fixture
def ela(email_ready):
    return UserFactory(email="ela@example.com", name="Ela")


def birthday_in(owner, name: str, days: int, **fields) -> Person:
    on = MONDAY + datetime.timedelta(days=days)
    return PersonFactory(owner=owner, name=name, birth_day=on.day, birth_month=on.month, **fields)


def send(user, on: datetime.date = MONDAY) -> bool:
    return tasks.send_digest.call(str(user.pk), on.isoformat())


def test_the_digest_has_who_is_due_and_birthdays(ela, mailoutbox):
    deniz = person(ela, "Deniz Arslan")
    keep_in_touch(deniz, interval_days=60)
    MemoryAidFactory(person=deniz, text="ask about the new flat in Moda", pinned=True)
    birthday_in(ela, "Emma Yılmaz", 4, birth_year=1996)  # Friday, with the 3 days' notice
    birthday_in(ela, "Priya Nair", 1)  # sooner than the notice: last week's email had her

    assert send(ela) is True

    [message] = mailoutbox
    assert message.to == ["ela@example.com"]
    assert message.subject == "1 person to catch up with this week"
    body = message.body
    assert "Deniz Arslan" in body
    assert "No talks logged yet · every 2 months" in body
    assert "Remember: ask about the new flat in Moda" in body
    assert "Emma Yılmaz — Friday 25 September, turns 30" in body
    assert "Priya" not in body
    assert f"https://folk.example.net/people/{deniz.pk}" in body
    assert "https://folk.example.net/we-talked/" in body
    assert "You get this every Monday at 08:00 from folk.example.net." in body
    html, _ = message.alternatives[0]
    assert "Week of 21 September" in html
    assert "Deniz — plus Emma&#x27;s birthday on Friday." in html  # the preview line
    unsubscribe = message.extra_headers["List-Unsubscribe"]
    assert unsubscribe.startswith("<https://folk.example.net/api/email-links/unsubscribe/")
    assert message.extra_headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert ReminderSettings.objects.get(user=ela).last_digest_on == MONDAY


def test_memory_aids_can_stay_inside_folkbook(ela, mailoutbox):
    ReminderSettings.objects.create(user=ela, include_memory_aids=False)
    deniz = person(ela, "Deniz")
    keep_in_touch(deniz, interval_days=30)
    MemoryAidFactory(person=deniz, text="ask about the new flat", pinned=True)

    send(ela)

    [message] = mailoutbox
    assert "new flat" not in message.body
    assert "new flat" not in message.alternatives[0][0]
    assert "Memory aids are left out." in message.body


def test_a_daily_digest_has_birthdays_on_the_notice_day_only(ela, mailoutbox):
    ReminderSettings.objects.create(user=ela, digest="daily", birthdays_days_before=1)
    birthday_in(ela, "Emma", 1)
    birthday_in(ela, "Priya", 2)

    send(ela)

    [message] = mailoutbox
    assert message.subject == "Emma's birthday is coming up"
    assert "Emma — Tuesday 22 September" in message.body
    assert "Priya" not in message.body


def test_birthdays_can_be_left_out(ela, mailoutbox):
    ReminderSettings.objects.create(user=ela, birthdays_days_before=None)
    birthday_in(ela, "Emma", 4)

    assert send(ela) is False
    assert mailoutbox == []


def test_nothing_due_means_no_email_but_the_day_is_done(ela, mailoutbox):
    assert send(ela) is False

    assert mailoutbox == []
    assert ReminderSettings.objects.get(user=ela).last_digest_on == MONDAY


def test_the_job_is_safe_to_run_twice(ela, mailoutbox):
    birthday_in(ela, "Emma", 4)

    assert send(ela) is True
    assert send(ela) is False
    assert len(mailoutbox) == 1


def test_no_digest_once_turned_off_or_deactivated(ela, mailoutbox):
    birthday_in(ela, "Emma", 4)
    ReminderSettings.objects.create(user=ela, digest="off")
    deniz = UserFactory(is_active=False)
    birthday_in(deniz, "Tom", 4)

    assert send(ela) is False
    assert send(deniz) is False
    assert mailoutbox == []


def test_the_digest_holds_only_what_the_app_would_show(world, email_ready, mailoutbox):
    """Deniz edits the climbing club with Ela: he sees Oskar there, but never Ela's own memory
    aids or timeline, nor anyone private to someone else."""
    oskar, deniz = world.oskar, world.deniz
    Person.objects.filter(pk=oskar.pk).update(created_at=at(MONDAY - datetime.timedelta(days=90)))
    oskar.refresh_from_db()
    keep_in_touch(oskar, user=deniz, interval_days=30)
    MemoryAidFactory(person=oskar, author=world.ela, text="Ela's secret aid", pinned=True)
    MemoryAidFactory(person=oskar, author=deniz, text="owes me a belay", pinned=True)
    Person.objects.filter(pk=world.jin.pk).update(birth_day=25, birth_month=9)  # Defne's, private
    Person.objects.filter(pk=world.yuki.pk).update(birth_day=25, birth_month=9)  # Deniz's own
    Person.objects.filter(pk=world.tom.pk).update(birth_day=25, birth_month=9)  # in a space

    send(deniz)
    send(world.ela)

    deniz_mail, ela_mail = mailoutbox
    assert "Oskar" in deniz_mail.body
    assert "owes me a belay" in deniz_mail.body
    assert "Ela's secret aid" not in deniz_mail.body + deniz_mail.alternatives[0][0]
    assert "Yuki" in deniz_mail.body
    assert "Jin" not in deniz_mail.body
    assert "Tom" in ela_mail.body  # Ela sees the hackathon: a birthday is basic profile
    assert "Jin" not in ela_mail.body
    assert "Yuki" not in ela_mail.body
    assert "owes me a belay" not in ela_mail.body


def test_queue_digests_picks_whoever_is_due_now(ela, monkeypatch):
    due_user = UserFactory()
    ReminderSettings.objects.create(user=due_user, digest="daily", time_zone="Europe/Istanbul")
    ReminderSettings.objects.create(user=ela, digest="off")
    UserFactory(is_active=False)
    now = local(MONDAY, 9)
    monkeypatch.setattr("reminders.tasks.timezone.now", lambda: now)

    queued = tasks.queue_digests.call()

    # Users without settings get the default (weekly, Monday, UTC): 06:00 UTC is too early.
    assert queued == 1
    [job] = DBTaskResult.objects.all()
    assert job.args_kwargs["args"] == [str(due_user.pk), "2026-09-21"]


def test_no_digests_without_email():
    user = UserFactory()
    ReminderSettings.objects.create(user=user, digest="daily")

    assert tasks.queue_digests.call() == 0


@pytest.mark.parametrize(
    ("name", "said"),
    [("Emma Yılmaz", "EY"), ("Ela", "E"), ("Ana María de la Cruz", "AC"), ("", "")],
)
def test_initials(name, said):
    assert initials(name) == said
