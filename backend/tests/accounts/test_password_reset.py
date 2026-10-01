"""Password reset links: made by an admin, used once, and the GET changes nothing."""

import datetime
import json

import pytest
from django.contrib.sessions.models import Session
from django.test import Client
from django.utils import timezone

from accounts.models import PasswordReset, User
from tests.factories import PASSWORD, UserFactory

pytestmark = pytest.mark.django_db

NEW_PASSWORD = "a fresh passphrase"


@pytest.fixture
def admin():
    return UserFactory(is_staff=True)


@pytest.fixture
def tom():
    return UserFactory(email="tom@example.com")


def make_link(api, admin, user) -> str:
    response = api.login(admin).post("/auth/password-resets", {"user_id": str(user.pk)})
    assert response.status_code == 201, response.content
    return response.json()["path"].removeprefix("/reset/")


def reset(token: str, password: str = NEW_PASSWORD, client: Client | None = None):
    return (client or Client()).post(
        f"/api/auth/password-resets/{token}",
        json.dumps({"password": password}),
        content_type="application/json",
    )


def test_an_admin_makes_a_link_shown_once(api, admin, tom):
    response = api.login(admin).post("/auth/password-resets", {"user_id": str(tom.pk)})

    body = response.json()
    assert body["email"] == "tom@example.com"
    assert body["path"].startswith("/reset/")
    token = body["path"].removeprefix("/reset/")
    assert not PasswordReset.objects.filter(token_hash=token).exists()  # only a hash is kept


def test_only_admins_make_links(api, tom):
    response = api.login(UserFactory()).post("/auth/password-resets", {"user_id": str(tom.pk)})

    assert response.status_code == 403


def test_looking_at_a_link_changes_nothing(api, admin, tom, client):
    token = make_link(api, admin, tom)

    first = client.get(f"/api/auth/password-resets/{token}")
    second = client.get(f"/api/auth/password-resets/{token}")

    assert first.json()["email"] == second.json()["email"] == "tom@example.com"
    tom.refresh_from_db()
    assert tom.check_password(PASSWORD)


def test_a_link_sets_a_new_password_once_and_signs_out_everywhere(api, admin, tom):
    browser = Client()
    browser.post(
        "/api/auth/login",
        json.dumps({"email": tom.email, "password": PASSWORD, "remember": True}),
        content_type="application/json",
    )
    assert Session.objects.exists()
    token = make_link(api, admin, tom)
    sessions_before = Session.objects.count()

    assert reset(token).status_code == 204
    assert reset(token, "another passphrase").status_code == 404  # used up

    tom.refresh_from_db()
    assert tom.check_password(NEW_PASSWORD)
    assert Session.objects.count() < sessions_before
    assert browser.get("/api/auth/me").status_code == 401


def test_a_new_link_replaces_the_old_one(api, admin, tom):
    old = make_link(api, admin, tom)
    new = make_link(api, admin, tom)

    assert reset(old).status_code == 404
    assert reset(new).status_code == 204


def test_expired_links_and_made_up_ones_look_the_same(api, admin, tom, client):
    token = make_link(api, admin, tom)
    PasswordReset.objects.update(expires_at=timezone.now() - datetime.timedelta(seconds=1))

    expired = client.get(f"/api/auth/password-resets/{token}")
    made_up = client.get("/api/auth/password-resets/not-a-token")

    assert expired.status_code == made_up.status_code == 404
    assert expired.json() == made_up.json()


def test_a_weak_password_is_refused_and_the_link_still_works(api, admin, tom):
    token = make_link(api, admin, tom)

    weak = reset(token, "password")

    assert weak.status_code == 422
    assert reset(token).status_code == 204


def test_deactivated_users_cannot_reset(api, admin, tom):
    token = make_link(api, admin, tom)
    User.objects.filter(pk=tom.pk).update(is_active=False)

    assert reset(token).status_code == 404


def test_using_a_link_needs_the_csrf_token(api, admin, tom):
    token = make_link(api, admin, tom)

    response = reset(token, client=Client(enforce_csrf_checks=True))

    assert response.status_code == 403
