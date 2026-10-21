"""Making, listing and revoking calendar links."""

import datetime
import re

from django.conf import settings
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from access.policy import Access
from api_keys import services as key_services
from api_keys.schemas import ApiKeyIn
from calendars import services
from calendars.models import CalendarFeed
from calendars.schemas import CalendarFeedIn
from core.tokens import hash_token


def test_creating_a_link_shows_its_url_once(api, world):
    client = api.login(world.ela)

    response = client.post("/calendars", {"name": "Family"})

    assert response.status_code == 201
    body = response.json()
    url = re.escape(settings.FOLKBOOK_URL)
    match = re.fullmatch(rf"{url}/api/calendars/feed/(fb_cal_[A-Za-z0-9]{{32}})\.ics", body["url"])
    assert match
    token = match.group(1)
    stored = CalendarFeed.objects.get()
    assert (stored.hashed, stored.last_five) == (hash_token(token), token[-5:])
    assert (body["name"], body["limited"], body["spaces"]) == ("Family", False, [])
    [item] = client.get("/calendars").json()["items"]
    assert "url" not in item
    assert token not in str(item) and token[7:] not in str(item)


def test_a_link_can_be_limited_to_spaces(api, world):
    response = api.login(world.ela).post(
        "/calendars", {"name": "Climbing", "space_ids": [str(world.climbing.pk)]}
    )

    body = response.json()
    assert body["limited"] is True
    assert [space["name"] for space in body["spaces"]] == ["Climbing club"]


def test_a_blank_name_or_a_space_you_cant_see_is_422(api, world):
    assert api.login(world.ela).post("/calendars", {"name": "  "}).status_code == 422

    response = api.login(world.sofia).post(
        "/calendars", {"name": "Sneaky", "space_ids": [str(world.climbing.pk)]}
    )
    assert response.status_code == 422
    assert not CalendarFeed.objects.exists()


def test_revoking_deletes_the_link_and_only_yours(api, world):
    feed_id = api.login(world.ela).post("/calendars", {"name": "Family"}).json()["id"]

    assert api.login(world.deniz).delete(f"/calendars/{feed_id}").status_code == 404
    assert api.login(world.ela).delete(f"/calendars/{feed_id}").status_code == 204
    assert not CalendarFeed.objects.exists()


def test_links_take_only_the_login_cookie(api, world):
    _, key = key_services.create_api_key(Access.for_user(world.ela), ApiKeyIn(name="Script"))

    assert api.with_key(key).get("/calendars").status_code == 401


def make(user, space_ids=None) -> CalendarFeed:
    feed, _ = services.create_feed(
        Access.for_user(user), CalendarFeedIn(name="Family", space_ids=space_ids)
    )
    return feed


def test_lists_your_links_newest_first(api, world):
    old = make(world.ela)
    CalendarFeed.objects.filter(pk=old.pk).update(
        created_at=timezone.now() - datetime.timedelta(days=2)
    )
    new = make(world.ela)

    items = api.login(world.ela).get("/calendars").json()["items"]

    assert [item["id"] for item in items] == [str(new.pk), str(old.pk)]


def test_someone_elses_links_are_never_listed(api, world):
    make(world.ela)

    assert api.login(world.deniz).get("/calendars").json() == {"items": [], "count": 0}


def test_spaces_you_cant_see_any_more_drop_off(api, world):
    make(world.ela, space_ids=[world.hackathon.pk])
    world.hackathon.memberships.filter(user=world.ela).delete()

    [item] = api.login(world.ela).get("/calendars").json()["items"]

    assert (item["limited"], item["spaces"]) == (True, [])


def test_query_count_does_not_grow(api, world):
    client = api.login(world.ela)

    def queries() -> int:
        with CaptureQueriesContext(connection) as captured:
            client.get("/calendars")
        return len(captured)

    make(world.ela, space_ids=[world.climbing.pk, world.hackathon.pk])
    before = queries()
    for _ in range(4):
        make(world.ela, space_ids=[world.climbing.pk, world.hackathon.pk])

    assert queries() == before
