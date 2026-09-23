"""Logging in and out, CSRF, passwords and signed-in devices."""

import datetime
import json

import pytest
from django.test import Client
from django.utils import timezone

from accounts.devices import describe_device
from accounts.models import Device, FailedLogin
from accounts.services import LAST_SEEN_EVERY, MAX_FAILED_LOGINS, touch_device
from core.http import client_ip
from tests.factories import PASSWORD, UserFactory

pytestmark = pytest.mark.django_db

FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5) Gecko/20100101 Firefox/131.0"
SAFARI_IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
)


def post(client: Client, path: str, data=None, **headers):
    return client.post(
        f"/api{path}", json.dumps(data or {}), content_type="application/json", **headers
    )


def log_in(client: Client, email: str, password: str = PASSWORD, **extra):
    return post(client, "/auth/login", {"email": email, "password": password, **extra})


@pytest.fixture
def ela():
    return UserFactory(email="ela@example.com", name="Ela Demir")


# ---------------------------------------------------------------- logging in


def test_log_in_and_see_who_you_are(client, ela):
    response = log_in(client, "Ela@Example.com")

    assert response.status_code == 200
    assert response.json()["me"]["name"] == "Ela Demir"
    assert client.get("/api/auth/me").json()["email"] == "ela@example.com"


@pytest.mark.parametrize(
    ("email", "password"),
    [("ela@example.com", "wrong password"), ("nobody@example.com", PASSWORD)],
)
def test_wrong_email_or_password_gives_the_same_answer(client, ela, email, password):
    response = log_in(client, email, password)

    assert response.status_code == 401
    assert response.json() == {"detail": "Wrong email or password."}


def test_deactivated_accounts_cannot_log_in(client, ela):
    ela.is_active = False
    ela.save()

    assert log_in(client, "ela@example.com").status_code == 401


def test_too_many_wrong_passwords_block_logging_in_for_a_while(client, ela):
    for _ in range(MAX_FAILED_LOGINS):
        log_in(client, "ela@example.com", "wrong password")

    response = log_in(client, "ela@example.com")  # even the right password

    assert response.status_code == 429
    assert "15 minutes" in response.json()["detail"]


def test_old_failures_no_longer_count(client, ela):
    for _ in range(MAX_FAILED_LOGINS):
        log_in(client, "ela@example.com", "wrong password")
    FailedLogin.objects.update(at=timezone.now() - datetime.timedelta(minutes=16))

    assert log_in(client, "ela@example.com").status_code == 200


def test_logging_in_clears_earlier_failures(client, ela):
    log_in(client, "ela@example.com", "wrong password")

    log_in(client, "ela@example.com")

    assert not FailedLogin.objects.exists()


def test_other_accounts_failures_do_not_block_you(client, ela):
    for _ in range(MAX_FAILED_LOGINS):
        log_in(client, "someone@example.com", "wrong password")

    assert log_in(client, "ela@example.com").status_code == 200


@pytest.mark.parametrize("remember", [True, False])
def test_keep_me_logged_in(client, ela, remember):
    log_in(client, "ela@example.com", remember=remember)

    assert client.session.get_expire_at_browser_close() is not remember
    if remember:
        assert client.session.get_expiry_age() > 399 * 24 * 60 * 60


def test_log_out(client, ela):
    log_in(client, "ela@example.com")

    assert post(client, "/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert not Device.objects.exists()


def test_who_am_i_needs_a_login(client):
    assert client.get("/api/auth/me").status_code == 401


# ---------------------------------------------------------------- CSRF, as a browser sees it


@pytest.fixture
def browser():
    return Client(enforce_csrf_checks=True)


def csrf_header(client: Client) -> dict:
    token = client.get("/api/auth/csrf").json()["csrf_token"]
    assert client.cookies["csrftoken"].value
    return {"HTTP_X_CSRFTOKEN": token}


def test_logging_in_needs_the_csrf_token(browser, ela):
    assert log_in(browser, "ela@example.com").status_code == 403

    response = post(
        browser,
        "/auth/login",
        {"email": "ela@example.com", "password": PASSWORD},
        **csrf_header(browser),
    )

    assert response.status_code == 200


def test_writes_need_the_csrf_token_after_logging_in(browser, ela):
    header = csrf_header(browser)
    post(browser, "/auth/login", {"email": "ela@example.com", "password": PASSWORD}, **header)
    header = csrf_header(browser)  # the token rotates on login

    assert post(browser, "/spaces", {"name": "Family"}).status_code == 403
    assert post(browser, "/spaces", {"name": "Family"}, **header).status_code == 201


# ---------------------------------------------------------------- password


def test_change_password_signs_out_other_devices_but_not_this_one(client, ela):
    other = Client()
    log_in(other, "ela@example.com")
    log_in(client, "ela@example.com")

    response = post(
        client,
        "/auth/password",
        {"current_password": PASSWORD, "new_password": "a brand new passphrase"},
    )

    assert response.status_code == 204
    assert client.get("/api/auth/me").status_code == 200
    assert other.get("/api/auth/me").status_code == 401
    assert log_in(Client(), "ela@example.com", "a brand new passphrase").status_code == 200


@pytest.mark.parametrize(
    ("current", "new", "field"),
    [
        ("not my password", "a brand new passphrase", "current_password"),
        (PASSWORD, "seven77", None),  # under 8 characters
        (PASSWORD, "123456789012345", None),  # only numbers
    ],
)
def test_bad_password_changes_are_rejected(client, ela, current, new, field):
    log_in(client, "ela@example.com")

    response = post(client, "/auth/password", {"current_password": current, "new_password": new})

    assert response.status_code == 422
    if field:
        assert response.json()["detail"][0]["loc"] == ["body", field]
    ela.refresh_from_db()
    assert ela.check_password(PASSWORD)


# ---------------------------------------------------------------- signed-in devices


def test_devices_list_where_you_are_signed_in(ela):
    laptop = Client(HTTP_USER_AGENT=FIREFOX_MAC)
    log_in(Client(HTTP_USER_AGENT=SAFARI_IPHONE), "ela@example.com")
    log_in(laptop, "ela@example.com")

    devices = laptop.get("/api/auth/devices").json()["items"]

    assert {(d["device"], d["is_current"]) for d in devices} == {
        ("Firefox on macOS", True),
        ("Safari on iPhone", False),
    }


def test_sign_out_another_device(client, ela):
    phone = Client()
    log_in(phone, "ela@example.com")
    log_in(client, "ela@example.com")
    other = next(d for d in client.get("/api/auth/devices").json()["items"] if not d["is_current"])

    assert client.delete(f"/api/auth/devices/{other['id']}").status_code == 204
    assert phone.get("/api/auth/me").status_code == 401


def test_sign_out_everywhere_else(client, ela):
    phones = [Client(), Client()]
    for phone in phones:
        log_in(phone, "ela@example.com")
    log_in(client, "ela@example.com")

    assert post(client, "/auth/devices/sign-out-others").status_code == 204
    assert [p.get("/api/auth/me").status_code for p in phones] == [401, 401]
    assert len(client.get("/api/auth/devices").json()["items"]) == 1


def test_you_cannot_sign_out_someone_elses_device(client, ela):
    deniz = UserFactory()
    other = Client()
    other.force_login(deniz)
    denizs_device = Device.objects.get(user=deniz)
    log_in(client, "ela@example.com")

    assert client.delete(f"/api/auth/devices/{denizs_device.pk}").status_code == 404
    assert other.get("/api/auth/me").status_code == 200


def test_admin_logins_are_listed_too(client, ela):
    client.force_login(ela)  # the same login() the admin uses

    assert Device.objects.filter(user=ela).count() == 1


def test_last_seen_is_updated_only_every_few_minutes(client, ela, rf):
    log_in(client, "ela@example.com")
    device = Device.objects.get()
    request = rf.get("/")
    request.session = client.session

    long_ago = timezone.now() - LAST_SEEN_EVERY - datetime.timedelta(seconds=1)
    Device.objects.update(last_seen=long_ago)
    touch_device(request)
    device.refresh_from_db()
    assert device.last_seen > long_ago

    just_now = device.last_seen
    touch_device(request)
    device.refresh_from_db()
    assert device.last_seen == just_now


@pytest.mark.parametrize(
    ("user_agent", "expected"),
    [
        (FIREFOX_MAC, "Firefox on macOS"),
        (SAFARI_IPHONE, "Safari on iPhone"),
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/129.0 Safari/537.36",
            "Chrome on Windows",
        ),
        (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/129.0 Safari/537.36 Edg/129.0",
            "Edge on Windows",
        ),
        (
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/129.0 Mobile Safari/537.36",
            "Chrome on Android",
        ),
        ("curl/8.9", "Unknown device"),
    ],
)
def test_describe_device(user_agent, expected):
    assert describe_device(user_agent) == expected


def test_client_ip_prefers_the_address_caddy_forwards(rf):
    request = rf.get("/", HTTP_X_FORWARDED_FOR="203.0.113.7, 172.18.0.3", REMOTE_ADDR="172.18.0.3")

    assert client_ip(request) == "203.0.113.7"
    assert client_ip(rf.get("/", REMOTE_ADDR="10.0.0.2")) == "10.0.0.2"


def test_switching_accounts_in_the_same_browser(client, ela):
    deniz = UserFactory(email="deniz@example.com")
    log_in(client, "ela@example.com")

    response = log_in(client, "deniz@example.com")

    assert response.status_code == 200
    assert client.get("/api/auth/me").json()["email"] == "deniz@example.com"
    assert Device.objects.get(session_key=client.session.session_key).user == deniz


def test_a_remembered_session_is_renewed_when_used(client, ela):
    log_in(client, "ela@example.com", remember=True)
    session = client.session
    session.set_expiry(60 * 60)  # as if it were about to run out
    session.save()
    Device.objects.update(last_seen=timezone.now() - LAST_SEEN_EVERY * 2)

    client.get("/api/auth/me")

    assert client.session.get_expiry_age() > 399 * 24 * 60 * 60


def test_a_session_that_is_not_remembered_still_ends_with_the_browser(client, ela):
    log_in(client, "ela@example.com", remember=False)
    Device.objects.update(last_seen=timezone.now() - LAST_SEEN_EVERY * 2)

    client.get("/api/auth/me")

    assert client.session.get_expire_at_browser_close()


def test_old_failed_logins_are_cleaned_up_as_new_ones_arrive(client, ela):
    log_in(client, "someone@example.com", "wrong password")
    FailedLogin.objects.update(at=timezone.now() - datetime.timedelta(hours=1))

    log_in(client, "another@example.com", "wrong password")

    assert list(FailedLogin.objects.values_list("email", flat=True)) == ["another@example.com"]
