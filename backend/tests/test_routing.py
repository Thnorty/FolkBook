"""Links that point at nothing get a 404 in the API's own shape, whatever they contain."""

import re
import uuid

import pytest
from django.urls import URLPattern, URLResolver, get_resolver

pytestmark = pytest.mark.django_db

# Path parameters that aren't ids (one-time links carry a token instead).
NOT_IDS = {"token"}
# `{uuid:id}` in a Ninja route becomes its own `uuidstr` converter.
UUID_CONVERTERS = {"uuid", "uuidstr"}


def api_routes(patterns=None, prefix=""):
    for pattern in get_resolver().url_patterns if patterns is None else patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            yield from api_routes(pattern.url_patterns, route)
        elif isinstance(pattern, URLPattern) and route.startswith("api/"):
            yield route


def test_every_id_in_an_api_path_must_be_a_uuid():
    # A malformed id ("abc") then can't match any route: it's simply not found (404), the
    # way the app's pages expect, instead of reaching a view and failing validation (422).
    untyped = sorted(
        f"{route} <{name}>"
        for route in set(api_routes())
        for converter, name in re.findall(r"<(?:(\w+):)?(\w+)>", route)
        if name not in NOT_IDS and converter not in UUID_CONVERTERS
    )
    assert untyped == []


@pytest.mark.parametrize(
    "path",
    [
        "/people/abc",
        "/people/abc/note",
        "/spaces/abc",
        "/relationships/abc",
        "/graph/paths/abc",
        "/graph/neighborhood/abc",
    ],
)
def test_a_malformed_id_is_not_found(api, world, path):
    response = api.login(world.ela).get(path)

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_an_api_path_that_matches_nothing_answers_like_the_api(api, world):
    response = api.login(world.ela).get(f"/nothing-here/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
