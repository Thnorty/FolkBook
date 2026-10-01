"""Admins managing the users on their server: list, make admin, deactivate."""

import json

import pytest
from django.contrib.sessions.models import Session
from django.test import Client

from accounts.models import User
from tests.factories import PASSWORD, UserFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return UserFactory(email="ela@example.com", name="Ela", is_staff=True)


@pytest.fixture
def deniz():
    return UserFactory(email="deniz@example.com", name="Deniz")


def test_admins_see_everyone(api, admin, deniz):
    response = api.login(admin).get("/users")

    users = {user["email"]: user for user in response.json()["items"]}
    assert users.keys() == {"deniz@example.com", "ela@example.com"}
    assert users["deniz@example.com"]["name"] == "Deniz"
    assert users["ela@example.com"]["is_admin"] is True


def test_members_see_nothing(api, deniz):
    assert api.login(deniz).get("/users").status_code == 403
    assert api.login(deniz).patch(f"/users/{deniz.pk}", {"is_admin": True}).status_code == 403


def test_make_someone_an_admin(api, admin, deniz):
    response = api.login(admin).patch(f"/users/{deniz.pk}", {"is_admin": True})

    assert response.json()["is_admin"] is True
    assert User.objects.get(pk=deniz.pk).is_staff


def test_deactivating_signs_them_out_and_stops_logins(api, admin, deniz):
    browser = Client()
    login = {"email": deniz.email, "password": PASSWORD, "remember": True}
    browser.post("/api/auth/login", json.dumps(login), content_type="application/json")
    assert Session.objects.exists()

    response = api.login(admin).patch(f"/users/{deniz.pk}", {"is_active": False})

    assert response.json()["is_active"] is False
    assert browser.get("/api/auth/me").status_code == 401
    again = Client().post("/api/auth/login", json.dumps(login), content_type="application/json")
    assert again.status_code == 401
    assert deniz.people.exists()  # their book is kept


def test_admins_cannot_change_themselves(api, admin):
    response = api.login(admin).patch(f"/users/{admin.pk}", {"is_admin": False})

    assert response.status_code == 409
    assert User.objects.get(pk=admin.pk).is_staff
