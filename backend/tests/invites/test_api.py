"""First-run setup and invite links. Uses the shared `world` and `api` client."""

import datetime
import json

import pytest
from django.test import Client
from django.utils import timezone

from accounts.models import User
from invites.models import Invite
from spaces.models import SpaceMembership

pytestmark = pytest.mark.django_db

NEW_PASSWORD = "a fresh passphrase"


def post(client: Client, path: str, data=None, **headers):
    return client.post(
        f"/api{path}", json.dumps(data or {}), content_type="application/json", **headers
    )


def sign_up(name="Tom Bergqvist", email="tom@example.com", password=NEW_PASSWORD) -> dict:
    return {"name": name, "email": email, "password": password}


def make_invite(api, user, **fields):
    response = api.login(user).post("/invites", fields)
    assert response.status_code == 201, response.content
    return response.json()


# ---------------------------------------------------------------- first run


def test_a_fresh_server_needs_setup(client):
    assert client.get("/api/setup").json() == {"needed": True}


def test_first_run_creates_the_admin_and_logs_in(client):
    response = post(client, "/setup", sign_up("Ela Demir", "ela@example.com"))

    assert response.status_code == 201
    assert response.json()["is_admin"]
    assert response.json()["me"]["name"] == "Ela Demir"
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/setup").json() == {"needed": False}


def test_first_run_only_works_once(client):
    post(client, "/setup", sign_up("Ela", "ela@example.com"))

    response = post(Client(), "/setup", sign_up("Mallory", "mallory@example.com"))

    assert response.status_code == 403
    assert User.objects.count() == 1


@pytest.mark.parametrize(
    ("data", "field"),
    [
        (sign_up(password="seven77"), "password"),
        (sign_up(password="12345678901"), "password"),
        (sign_up(email="not an email"), "email"),
    ],
)
def test_first_run_rejects_bad_details(client, data, field):
    response = post(client, "/setup", data)

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", field]
    assert not User.objects.exists()


def test_first_run_needs_the_csrf_token():
    browser = Client(enforce_csrf_checks=True)

    assert post(browser, "/setup", sign_up()).status_code == 403


# ---------------------------------------------------------------- creating invites


@pytest.fixture
def admin(world):
    world.ela.is_staff = True
    world.ela.save()
    return world.ela


def test_admins_can_invite_anyone(api, admin):
    invite = make_invite(api, admin, expires_in_days=7, max_uses=10)

    assert invite["path"] == f"/i/{invite['token']}"
    assert (invite["uses"], invite["max_uses"], invite["space"]) == (0, 10, None)
    assert invite["is_usable"]


def test_members_cannot_make_plain_invites(api, world):
    assert api.login(world.kaan).post("/invites", {}).status_code == 403


def test_space_owners_can_invite_into_their_space(api, world):
    invite = make_invite(api, world.defne, space_id=str(world.hackathon.pk))

    assert invite["space"]["name"] == "Hackathon 2026"
    assert invite["role"] == "viewer"


@pytest.mark.parametrize(
    ("who", "space", "status"),
    [
        ("deniz", "climbing", 403),  # an editor, not the owner
        ("ela", "hackathon", 403),  # a viewer
        ("deniz", "hackathon", 404),  # can't see the space
    ],
)
def test_only_owners_invite_into_a_space(api, world, who, space, status):
    response = api.login(getattr(world, who)).post(
        "/invites", {"space_id": str(getattr(world, space).pk)}
    )

    assert response.status_code == status


@pytest.mark.parametrize("fields", [{"expires_in_days": 31}, {"max_uses": 0}, {"role": "owner"}])
def test_invite_limits(api, admin, fields):
    assert api.login(admin).post("/invites", fields).status_code == 422


def test_you_see_your_invites_and_admins_see_all(api, world, admin):
    make_invite(api, admin)
    make_invite(api, world.defne, space_id=str(world.hackathon.pk))

    def count(user):
        return api.login(user).get("/invites").json()["count"]

    assert (count(admin), count(world.defne), count(world.kaan)) == (2, 1, 0)


@pytest.mark.parametrize(("who", "status"), [("defne", 204), ("ela", 204), ("kaan", 404)])
def test_revoking_an_invite(api, world, admin, who, status):
    invite = make_invite(api, world.defne, space_id=str(world.hackathon.pk))

    response = api.login(getattr(world, who)).delete(f"/invites/{invite['id']}")

    assert response.status_code == status
    assert Invite.objects.exists() == (status != 204)


def test_deleting_a_space_deletes_its_invites(api, world):
    make_invite(api, world.defne, space_id=str(world.hackathon.pk))

    world.hackathon.delete()

    assert not Invite.objects.exists()


# ---------------------------------------------------------------- using an invite


@pytest.fixture
def hackathon_invite(api, world):
    return make_invite(api, world.defne, space_id=str(world.hackathon.pk), max_uses=2)


def test_preview_shows_who_invites_you_and_to_what(client, hackathon_invite):
    preview = client.get(f"/api/invites/by-token/{hackathon_invite['token']}").json()

    assert preview["invited_by"] == "Defne"
    assert preview["space"]["name"] == "Hackathon 2026"
    assert (preview["space_people_count"], preview["role"]) == (2, "viewer")


def test_sign_up_with_an_invite_joins_the_space(client, world, hackathon_invite):
    response = post(client, f"/invites/by-token/{hackathon_invite['token']}/accept", sign_up())

    assert response.status_code == 201
    tom = User.objects.get(email="tom@example.com")
    assert not tom.is_staff
    assert SpaceMembership.objects.get(user=tom).space == world.hackathon
    names = {p["name"] for p in client.get("/api/people").json()["items"]}
    assert {"Tom", "Ola", "Defne"} <= names  # Defne's space and its people


def test_an_invite_can_only_be_used_as_often_as_allowed(hackathon_invite):
    path = f"/invites/by-token/{hackathon_invite['token']}/accept"

    assert post(Client(), path, sign_up(email="a@example.com")).status_code == 201
    assert post(Client(), path, sign_up(email="b@example.com")).status_code == 201
    response = post(Client(), path, sign_up(email="c@example.com"))

    assert response.status_code == 404
    assert "expired" in response.json()["detail"]
    assert Invite.objects.get().uses == 2


@pytest.mark.parametrize("problem", ["unknown", "expired", "used up"])
def test_unusable_invites_all_look_the_same(client, hackathon_invite, problem):
    token = hackathon_invite["token"]
    if problem == "unknown":
        token = "not-a-real-token"
    elif problem == "expired":
        Invite.objects.update(expires_at=timezone.now() - datetime.timedelta(seconds=1))
    else:
        Invite.objects.update(uses=2)

    preview = client.get(f"/api/invites/by-token/{token}")
    accept = post(client, f"/invites/by-token/{token}/accept", sign_up())

    assert preview.status_code == accept.status_code == 404
    assert preview.json() == accept.json()


def test_signing_up_with_a_taken_email_uses_nothing(client, world, hackathon_invite):
    response = post(
        client,
        f"/invites/by-token/{hackathon_invite['token']}/accept",
        sign_up(email="KAAN@example.com"),
    )

    assert response.status_code == 409
    assert Invite.objects.get().uses == 0


def test_a_weak_password_uses_nothing(client, hackathon_invite):
    response = post(
        client,
        f"/invites/by-token/{hackathon_invite['token']}/accept",
        sign_up(password="password"),
    )

    assert response.status_code == 422
    assert Invite.objects.get().uses == 0
    assert not User.objects.filter(email="tom@example.com").exists()


def test_existing_users_join_the_space_with_the_invite(api, world, hackathon_invite):
    response = api.login(world.sofia).post(f"/invites/by-token/{hackathon_invite['token']}/join")

    assert response.status_code == 200
    assert response.json()["name"] == "Hackathon 2026"
    assert world.hackathon.memberships.filter(user=world.sofia, role="viewer").exists()


def test_joining_a_space_you_are_already_in(api, world, hackathon_invite):
    response = api.login(world.ela).post(f"/invites/by-token/{hackathon_invite['token']}/join")

    assert response.status_code == 409
    assert Invite.objects.get().uses == 0


def test_plain_invites_are_for_new_people(api, world, admin):
    invite = make_invite(api, admin)

    response = api.login(world.sofia).post(f"/invites/by-token/{invite['token']}/join")

    assert response.status_code == 409


def test_accepting_needs_the_csrf_token(hackathon_invite):
    browser = Client(enforce_csrf_checks=True)

    response = post(browser, f"/invites/by-token/{hackathon_invite['token']}/accept", sign_up())

    assert response.status_code == 403


def test_invite_tokens_are_long_and_random(api, admin):
    tokens = {make_invite(api, admin)["token"] for _ in range(5)}

    assert len(tokens) == 5
    assert all(len(token) >= 32 for token in tokens)
