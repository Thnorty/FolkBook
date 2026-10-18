"""Reminder email settings, Send test email, and the links in the email (Unsubscribe and
"We talked"): opening one changes nothing; confirming does, only while it should."""

import datetime
import re

import pytest
from django.core import signing
from django.test import Client

from access.policy import Access
from api_keys import services as api_key_services
from api_keys.schemas import ApiKeyIn
from interactions.models import Interaction
from reminders import links, services
from reminders.models import ReminderSettings
from tests.factories import PersonFactory, UserFactory
from tests.reminders.test_nudges import person

pytestmark = pytest.mark.django_db


@pytest.fixture
def ela():
    return UserFactory(email="ela@example.com", name="Ela")


# ---------------------------------------------------------------- settings and test email


def test_digest_settings_are_saved(api, ela):
    response = api.login(ela).put(
        "/keep-in-touch/settings",
        {
            "digest": "daily",
            "include_memory_aids": False,
            "birthdays_days_before": None,
            "time_zone": "Europe/Istanbul",
        },
    )

    body = response.json()
    assert (body["digest"], body["include_memory_aids"], body["birthdays_days_before"]) == (
        "daily",
        False,
        None,
    )
    assert body["send_to"] == "ela@example.com"
    stored = ReminderSettings.objects.get(user=ela)
    assert stored.time_zone == "Europe/Istanbul"


@pytest.mark.parametrize(
    "change",
    [
        {"time_zone": "Mars/Olympus"},
        {"digest": "hourly"},
        {"digest_weekday": 7},
        {"birthdays_days_before": 31},
    ],
)
def test_digest_settings_are_checked(api, ela, change):
    assert api.login(ela).put("/keep-in-touch/settings", change).status_code == 422


def test_a_test_digest_goes_to_you(api, ela, email_ready, mailoutbox):
    PersonFactory(owner=ela, name="Emma", birth_day=1, birth_month=1)

    response = api.login(ela).post("/keep-in-touch/settings/test-email")

    assert response.json() == {"ok": True, "message": "Sent to ela@example.com"}
    [message] = mailoutbox
    assert message.to == ["ela@example.com"]
    assert ReminderSettings.objects.filter(user=ela, last_digest_on__isnull=False).count() == 0


def test_an_empty_test_digest_says_so(api, ela, email_ready, mailoutbox):
    api.login(ela).post("/keep-in-touch/settings/test-email")

    [message] = mailoutbox
    assert message.subject == "No one to catch up with right now"
    assert message.body.startswith("No one to catch up with right now\n")  # not "Birthdays…"
    assert "Your digest only comes when there's someone in it." in message.body
    html = message.alternatives[0].content
    assert "No one is due and no birthdays are coming up.</div>" in html  # the preview line


def test_no_test_digest_without_email(api, ela, mailoutbox):
    assert api.login(ela).post("/keep-in-touch/settings/test-email").status_code == 409
    assert api.get("/keep-in-touch/settings").json()["email_ready"] is False


def test_a_script_cannot_send_test_digests(api, ela, email_ready, mailoutbox):
    _, key = api_key_services.create_api_key(
        Access.for_user(ela), ApiKeyIn(name="Script", read_only=False)
    )

    assert api.with_key(key).post("/keep-in-touch/settings/test-email").status_code == 401
    assert mailoutbox == []


# ---------------------------------------------------------------- unsubscribe


def test_unsubscribe_asks_first_then_stops_the_digest(api, ela):
    token = links.unsubscribe_token(ela)

    preview = api.get(f"/email-links/unsubscribe/{token}")
    assert preview.json() == {"email": "ela@example.com", "subscribed": True}
    assert not ReminderSettings.objects.filter(user=ela).exists()  # looking changed nothing

    assert api.post(f"/email-links/unsubscribe/{token}").status_code == 204
    assert ReminderSettings.objects.get(user=ela).digest == "off"
    assert api.get(f"/email-links/unsubscribe/{token}").json()["subscribed"] is False


def test_email_apps_unsubscribe_in_one_click(ela):
    """RFC 8058: the email app POSTs a form, with no cookie and no CSRF token."""
    token = links.unsubscribe_token(ela)

    response = Client(enforce_csrf_checks=True).post(
        f"/api/email-links/unsubscribe/{token}", {"List-Unsubscribe": "One-Click"}
    )

    assert response.status_code == 204
    assert ReminderSettings.objects.get(user=ela).digest == "off"


@pytest.mark.parametrize(
    "token",
    [
        "nonsense",
        signing.dumps("00000000-0000-0000-0000-000000000000", salt=links.UNSUBSCRIBE),
        signing.dumps("someone", salt="another.purpose"),
    ],
)
def test_a_broken_unsubscribe_link_is_not_found(api, ela, token):
    assert api.get(f"/email-links/unsubscribe/{token}").status_code == 404
    assert api.post(f"/email-links/unsubscribe/{token}").status_code == 404


def test_a_talked_link_cannot_unsubscribe(api, ela):
    token = links.talked_token(ela, PersonFactory(owner=ela))

    assert api.post(f"/email-links/unsubscribe/{token}").status_code == 404


# ---------------------------------------------------------------- we talked


def test_we_talked_asks_first_then_logs_it_once(api, ela):
    ReminderSettings.objects.create(user=ela, time_zone="Pacific/Kiritimati")  # UTC+14
    deniz = PersonFactory(owner=ela, name="Deniz")
    token = links.talked_token(ela, deniz)

    preview = api.get(f"/email-links/we-talked/{token}")
    assert preview.json()["person"]["name"] == "Deniz"
    assert not Interaction.objects.exists()

    assert api.post(f"/email-links/we-talked/{token}").json() == {"logged": True}
    assert api.post(f"/email-links/we-talked/{token}").json() == {"logged": False}
    [entry] = Interaction.objects.all()
    assert (entry.author, entry.person, entry.kind, entry.label) == (ela, deniz, "custom", "Talked")
    kiritimati = datetime.datetime.now(datetime.UTC) + datetime.timedelta(hours=14)
    assert entry.occurred_on == kiritimati.date()  # the user's own today


def test_we_talked_links_run_out(api, ela, monkeypatch):
    token = links.talked_token(ela, PersonFactory(owner=ela))
    later = datetime.datetime.now().timestamp() + links.TALKED_LINK_LASTS.total_seconds() + 60
    monkeypatch.setattr("django.core.signing.time.time", lambda: later)

    assert api.post(f"/email-links/we-talked/{token}").status_code == 404
    assert not Interaction.objects.exists()


def test_we_talked_needs_the_person_still_in_your_book(api, world):
    """Kaan sees Oskar through the climbing club. Once he's out of it, the link stops
    working, and the answer never shows Oskar's name."""
    kaan, oskar = world.kaan, world.oskar
    token = links.talked_token(kaan, oskar)
    assert api.get(f"/email-links/we-talked/{token}").status_code == 200

    world.climbing.memberships.filter(user=kaan).delete()

    response = api.get(f"/email-links/we-talked/{token}")
    assert response.status_code == 404
    assert "Oskar" not in response.content.decode()
    assert api.post(f"/email-links/we-talked/{token}").status_code == 404
    assert not Interaction.objects.filter(author=kaan).exists()


def test_we_talked_stops_for_a_deactivated_account(api, ela):
    token = links.talked_token(ela, PersonFactory(owner=ela))
    ela.is_active = False
    ela.save()

    assert api.post(f"/email-links/we-talked/{token}").status_code == 404


def test_an_unsubscribe_link_cannot_log_a_talk(api, ela):
    token = links.unsubscribe_token(ela)

    assert api.post(f"/email-links/we-talked/{token}").status_code == 404


def test_the_digest_links_work(api, ela, email_ready, mailoutbox):
    """The links as they are in a real email."""
    ReminderSettings.objects.create(user=ela, default_interval_days=30)
    person(ela, "Deniz")  # in the book long enough to be due

    services.send_test_digest(ela)
    body = mailoutbox[0].body
    talked = re.search(r"https://folk\.example\.net/we-talked/(\S+)", body).group(1)
    unsubscribe = re.search(r"https://folk\.example\.net/unsubscribe/(\S+)", body).group(1)

    assert api.post(f"/email-links/we-talked/{talked}").json() == {"logged": True}
    assert api.post(f"/email-links/unsubscribe/{unsubscribe}").status_code == 204
    assert api.get(f"/email-links/unsubscribe/{unsubscribe}").json()["subscribed"] is False
