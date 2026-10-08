"""120 requests a minute per key, and when each key was last used."""

import datetime

import pytest
from django.utils import timezone

from access.policy import Access
from api_keys import services
from api_keys.models import ApiKey
from api_keys.schemas import ApiKeyIn

TOO_MANY = {"detail": "Too many requests for this API key. Try again in a minute."}


def make(user) -> tuple[ApiKey, str]:
    return services.create_api_key(Access.for_user(user), ApiKeyIn(name="Script"))


def test_last_used_is_set(api, world):
    api_key, key = make(world.ela)
    before = timezone.now()

    api.with_key(key).get("/people")

    api_key.refresh_from_db()
    assert api_key.last_used_at >= before


def test_the_121st_request_in_a_minute_is_429(api, world):
    api_key, key = make(world.ela)
    ApiKey.objects.filter(pk=api_key.pk).update(window_start=timezone.now(), window_count=120)

    response = api.with_key(key).get("/people")

    assert response.status_code == 429
    assert response.json() == TOO_MANY
    assert 1 <= int(response["Retry-After"]) <= 60


def test_a_new_minute_starts_again(api, world):
    api_key, key = make(world.ela)
    earlier = timezone.now() - datetime.timedelta(seconds=61)
    ApiKey.objects.filter(pk=api_key.pk).update(window_start=earlier, window_count=120)

    assert api.with_key(key).get("/people").status_code == 200
    api_key.refresh_from_db()
    assert api_key.window_count == 1


def test_the_limit_is_per_key(api, world):
    busy, busy_key = make(world.ela)
    _, other_key = make(world.ela)
    ApiKey.objects.filter(pk=busy.pk).update(window_start=timezone.now(), window_count=120)

    assert api.with_key(busy_key).get("/people").status_code == 429
    assert api.with_key(other_key).get("/people").status_code == 200


def test_count_request_twice_counts_two(world):
    api_key, _ = make(world.ela)
    now = timezone.now()

    services.count_request(api_key, now=now)
    services.count_request(api_key, now=now + datetime.timedelta(seconds=1))

    api_key.refresh_from_db()
    assert (api_key.window_start, api_key.window_count) == (now, 2)


def test_count_request_stops_at_the_limit(world):
    api_key, _ = make(world.ela)
    now = timezone.now()
    ApiKey.objects.filter(pk=api_key.pk).update(window_start=now, window_count=120)
    api_key.refresh_from_db()

    with pytest.raises(services.TooManyRequests) as raised:
        services.count_request(api_key, now=now + datetime.timedelta(seconds=20))

    assert raised.value.retry_after == 40


def test_full_while_this_request_looked_the_key_up(world):
    """Many requests on a new key at once: this one read it before any was counted."""
    api_key, _ = make(world.ela)  # window_start is still empty here
    now = timezone.now()
    ApiKey.objects.filter(pk=api_key.pk).update(window_start=now, window_count=120)

    with pytest.raises(services.TooManyRequests) as raised:
        services.count_request(api_key, now=now + datetime.timedelta(seconds=15))

    assert raised.value.retry_after == 45


def test_revoked_while_this_request_looked_the_key_up(world):
    api_key, _ = make(world.ela)
    ApiKey.objects.filter(pk=api_key.pk).delete()

    with pytest.raises(services.InvalidApiKey):
        services.count_request(api_key)
