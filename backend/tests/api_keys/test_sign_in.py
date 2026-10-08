"""Signing in with an API key instead of the login cookie."""

import datetime
import logging
import re

import pytest
from django.test import Client
from django.utils import timezone

from access.policy import Access
from api_keys import services
from api_keys.auth import api_key_auth
from api_keys.schemas import ApiKeyIn
from config.api import api as folkbook_api
from spaces import services as space_services
from tests.api_client import ApiClient

INVALID = {"detail": "This API key isn't valid."}

# Account-level routes: the login cookie only (spec §2).
COOKIE_ONLY = (
    "/api/auth",
    "/api/setup",
    "/api/users",
    "/api/invites",
    "/api/api-keys",
    "/api/export/restore",
    "/api/keep-in-touch/settings",  # nudges for the whole book: the account's
)
# The book: API keys work here. A new router goes in one list or the other, on purpose.
TAKES_KEYS = (
    "/api/auth/me",
    "/api/people",
    "/api/spaces",
    "/api/relationships",
    "/api/graph",
    "/api/memory-aids",
    "/api/interactions",
    "/api/keep-in-touch",
    "/api/today",
    "/api/search",
    "/api/export",
    "/api/imports",
)


def under(path: str, prefixes: tuple[str, ...]) -> str | None:
    """The longest prefix the path sits under, by whole segments (/api/authors isn't
    under /api/auth)."""
    found = [p for p in prefixes if path == p or path.startswith(p + "/")]
    return max(found, key=len, default=None)


def key_for(user, **data) -> str:
    _, key = services.create_api_key(Access.for_user(user), ApiKeyIn(name="Script", **data))
    return key


def names(response) -> list[str]:
    return sorted(person["name"] for person in response.json()["items"])


def test_a_key_signs_in(api, world):
    response = api.with_key(key_for(world.ela)).get("/people")

    assert response.status_code == 200
    assert "Emma" in names(response)


def test_writes_need_no_csrf_token(api, world):
    client = api.with_key(key_for(world.ela, read_only=False), enforce_csrf_checks=True)

    response = client.post("/people", {"name": "Greta"})

    assert response.status_code == 201


@pytest.mark.parametrize("problem", ["unknown", "expired", "disabled owner", "empty"])
def test_bad_keys_are_401(api, world, problem):
    key = key_for(world.ela)
    if problem == "unknown":
        key = services.new_key()
    elif problem == "expired":
        world.ela.api_keys.update(expires_at=timezone.now() - datetime.timedelta(seconds=1))
    elif problem == "disabled owner":
        world.ela.is_active = False
        world.ela.save()
    else:
        key = ""

    response = api.with_key(key).get("/people")

    assert response.status_code == 401
    assert response.json() == INVALID
    assert response["WWW-Authenticate"] == "Bearer"


def test_a_bad_key_never_falls_back_to_the_login_cookie(api, world, client):
    client.force_login(world.ela)

    response = client.get("/api/people", headers={"Authorization": f"Bearer {services.new_key()}"})

    assert response.status_code == 401
    assert response.json() == INVALID


def test_cookie_only_endpoints_refuse_keys(api, world):
    client = api.with_key(key_for(world.ela, read_only=False, include_private=True))

    assert client.get("/auth/devices").status_code == 401
    assert client.get("/api-keys").status_code == 401
    assert client.post("/api-keys", {"name": "Another"}).status_code == 401
    assert client.get("/keep-in-touch/settings").status_code == 401
    assert client.put("/keep-in-touch/settings", {"nudges_on": False}).status_code == 401
    assert client.get(f"/keep-in-touch/{world.oskar.pk}").status_code == 200
    assert client.post("/export/restore/check").status_code == 401
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ela@example.com"


def test_every_route_is_cookie_only_or_takes_keys():
    """A new endpoint has to be put on one side on purpose."""
    wrong = []
    for router in folkbook_api._get_bound_routers():
        for path, view in router.path_operations.items():
            for operation in view.operations:
                full = re.sub("/+", "/", f"/api/{router.prefix}/{path}").rstrip("/")
                if not operation.auth_callbacks:
                    continue  # public, like /api/health
                cookie, keys = under(full, COOKIE_ONLY), under(full, TAKES_KEYS)
                if cookie is None and keys is None:
                    wrong.append(("unclassified", operation.methods, full))
                    continue
                # The longer prefix wins: /api/export/restore is cookie-only inside
                # /api/export, /api/auth/me takes keys inside /api/auth.
                should_take_keys = len(keys or "") > len(cookie or "")
                if (api_key_auth in operation.auth_callbacks) != should_take_keys:
                    wrong.append(("wrong side", operation.methods, full))

    assert wrong == []


def test_the_key_narrows_access(api, world):
    read_only = api.with_key(key_for(world.ela))

    assert read_only.post("/people", {"name": "Greta"}).status_code == 403
    assert read_only.get("/memory-aids").json() == {"items": [], "count": 0}
    no_private = api.with_key(key_for(world.ela, read_only=False))
    note = no_private.put(f"/people/{world.oskar.pk}/note", {"body": "Climbs on Tuesdays"})
    assert note.status_code == 403


def test_a_key_whose_spaces_are_gone_sees_nothing(api, world):
    client = api.with_key(key_for(world.ela, space_ids=[world.climbing.pk]))
    space_services.delete_space(Access.for_user(world.ela), world.climbing)

    # Only Ela's own Me, which any key of hers sees (access/test_limited_access.py).
    assert names(client.get("/people")) == ["Ela"]


def test_re_enabling_the_owner_brings_the_key_back(api, world):
    client = api.with_key(key_for(world.ela))
    world.ela.is_active = False
    world.ela.save()
    assert client.get("/people").status_code == 401

    world.ela.is_active = True
    world.ela.save()

    assert client.get("/people").status_code == 200


def test_a_key_without_the_bearer_word_is_never_logged(api, world, settings, caplog):
    settings.DEBUG = True  # Ninja logs odd Authorization headers in full when debugging
    key = key_for(world.ela)

    with caplog.at_level(logging.DEBUG):
        response = ApiClient(Client(headers={"Authorization": key})).get("/people")

    assert response.status_code == 401
    assert key not in caplog.text
