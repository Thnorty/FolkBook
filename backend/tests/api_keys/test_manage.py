"""Making, listing and revoking API keys."""

import datetime
import hashlib
import re

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from access.policy import Access
from api_keys import services
from api_keys.models import ApiKey
from api_keys.schemas import ApiKeyIn
from tests.factories import SpaceFactory


def make(user, **data) -> tuple[ApiKey, str]:
    return services.create_api_key(Access.for_user(user), ApiKeyIn(name="Script", **data))


def test_creates_a_key(api, world):
    response = api.login(world.ela).post(
        "/api-keys", {"name": "Birthday script", "space_ids": [str(world.climbing.pk)]}
    )

    assert response.status_code == 201
    body = response.json()
    assert re.fullmatch(r"fb_live_[A-Za-z0-9]{32}", body["key"])
    assert body["last_five"] == body["key"][-5:]
    assert (body["read_only"], body["include_private"], body["limited"]) == (True, False, True)
    assert body["spaces"] == [
        {"id": str(world.climbing.pk), "name": "Climbing club", "color": world.climbing.color}
    ]
    expires = datetime.datetime.fromisoformat(body["expires_at"])
    assert abs(expires - (timezone.now() + datetime.timedelta(days=90))) < datetime.timedelta(
        minutes=1
    )


def test_the_key_is_shown_once(api, world):
    client = api.login(world.ela)
    key = client.post("/api-keys", {"name": "Script"}).json()["key"]

    [item] = client.get("/api-keys").json()["items"]

    assert "key" not in item
    stored = ApiKey.objects.get()
    assert stored.hashed == hashlib.sha256(key.encode()).hexdigest()
    columns = [str(getattr(stored, field.attname)) for field in ApiKey._meta.concrete_fields]
    assert not any(key in value or key[8:] in value for value in columns)


@pytest.mark.parametrize(
    ("expires_in", "days"), [("30d", 30), ("90d", 90), ("1y", 365), ("never", None)]
)
def test_expiry_choices(api, world, expires_in, days):
    body = api.login(world.ela).post("/api-keys", {"name": "S", "expires_in": expires_in}).json()

    if days is None:
        assert body["expires_at"] is None
    else:
        expires = datetime.datetime.fromisoformat(body["expires_at"])
        expected = timezone.now() + datetime.timedelta(days=days)
        assert abs(expires - expected) < datetime.timedelta(minutes=1)


def test_all_spaces(api, world):
    body = api.login(world.ela).post("/api-keys", {"name": "Home Assistant"}).json()

    assert (body["limited"], body["spaces"]) == (False, [])


def test_a_space_you_only_view_can_be_picked(api, world):
    response = api.login(world.ela).post(
        "/api-keys", {"name": "S", "space_ids": [str(world.hackathon.pk)]}
    )

    assert response.status_code == 201


@pytest.mark.parametrize(
    ("data", "message"),
    [
        ({"name": ""}, None),
        ({"name": "x" * 61}, None),
        ({"name": "S", "space_ids": []}, "Pick at least one space, or All spaces."),
        ({"name": "S", "space_ids": ["sofia"]}, "That space isn't one you can pick."),
        (
            {"name": "S", "space_ids": ["7d3c2f0e-0000-4000-8000-000000000000"]},
            "That space isn't one you can pick.",
        ),
    ],
    ids=["no name", "long name", "no spaces", "someone else's space", "unknown space"],
)
def test_bad_input(api, world, data, message):
    if data.get("space_ids") == ["sofia"]:
        data = {**data, "space_ids": [str(SpaceFactory(owner=world.sofia).pk)]}

    response = api.login(world.ela).post("/api-keys", data)

    assert response.status_code == 422
    if message:
        assert response.json() == {"detail": [{"loc": ["body", "space_ids"], "msg": message}]}
    assert not ApiKey.objects.exists()


def test_lists_your_keys_newest_first(api, world):
    old, _ = make(world.ela)
    ApiKey.objects.filter(pk=old.pk).update(
        created_at=timezone.now() - datetime.timedelta(days=2),
        expires_at=timezone.now() - datetime.timedelta(days=1),
    )
    new, _ = make(world.ela, expires_in="never")

    items = api.login(world.ela).get("/api-keys").json()["items"]

    assert [(item["id"], item["expired"]) for item in items] == [
        (str(new.pk), False),
        (str(old.pk), True),
    ]


def test_spaces_you_cant_see_any_more_drop_off(api, world):
    make(world.ela, space_ids=[world.hackathon.pk])
    world.hackathon.memberships.filter(user=world.ela).delete()

    [item] = api.login(world.ela).get("/api-keys").json()["items"]

    assert (item["limited"], item["spaces"]) == (True, [])


def test_revoke(api, world):
    key, _ = make(world.ela)
    client = api.login(world.ela)

    assert client.delete(f"/api-keys/{key.pk}").status_code == 204
    assert not ApiKey.objects.exists()


def test_someone_elses_key_is_404(api, world):
    key, _ = make(world.ela)
    client = api.login(world.deniz)

    assert client.delete(f"/api-keys/{key.pk}").status_code == 404
    assert client.get("/api-keys").json() == {"items": [], "count": 0}
    assert ApiKey.objects.filter(pk=key.pk).exists()


def test_query_count_does_not_grow(api, world):
    client = api.login(world.ela)

    def queries() -> int:
        with CaptureQueriesContext(connection) as captured:
            client.get("/api-keys")
        return len(captured)

    make(world.ela, space_ids=[world.climbing.pk, world.hackathon.pk])
    before = queries()
    for _ in range(4):
        make(world.ela, space_ids=[world.climbing.pk, world.hackathon.pk])

    assert queries() == before
