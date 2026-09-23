import json

import pytest
from django.conf import settings
from django.db import models
from ninja.responses import NinjaJSONEncoder

from config.api import api

pytestmark = pytest.mark.django_db

SPEC_FILE = settings.BASE_DIR.parent / "frontend" / "openapi.json"


@pytest.mark.parametrize("path", ["/api/docs", "/api/openapi.json", "/api/health"])
def test_public_api_pages_need_no_login(client, path):
    assert client.get(path).status_code == 200


def test_the_openapi_spec_lists_the_notebook_endpoints(client):
    paths = client.get("/api/openapi.json").json()["paths"]

    assert {"/api/people", "/api/people/{person_id}", "/api/spaces"} <= set(paths)


def test_the_frontend_has_the_current_api_spec():
    # The frontend's API types are generated from this file, so it must match the API.
    committed = json.loads(SPEC_FILE.read_text(encoding="utf-8"))
    current = json.loads(json.dumps(api.get_openapi_schema(), cls=NinjaJSONEncoder))

    assert committed == current, "The API changed. Run `npm run api:generate` in frontend/."


def test_enum_names_are_unique():
    # The API spec names each enum after its class; two enums with the same name would
    # collide there and one would silently replace the other.
    def all_subclasses(cls):
        for sub in cls.__subclasses__():
            yield sub
            yield from all_subclasses(sub)

    ours = [
        choices
        for choices in all_subclasses(models.TextChoices)
        if not choices.__module__.startswith("django.")
    ]
    names = [choices.__name__ for choices in ours]

    assert len(names) == len(set(names)), sorted(names)


def test_contact_methods_and_timeline_kinds_are_told_apart():
    schemas = api.get_openapi_schema()["components"]["schemas"]
    contact = schemas["ContactMethodOut"]["properties"]["kind"]["$ref"].rsplit("/", 1)[1]
    timeline = schemas["InteractionOut"]["properties"]["kind"]["$ref"].rsplit("/", 1)[1]

    assert schemas[contact]["enum"] == ["phone", "email", "social", "other"]
    assert schemas[timeline]["enum"] == ["met", "call", "message", "event", "custom"]
