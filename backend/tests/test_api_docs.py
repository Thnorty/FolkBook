import json

import pytest
from django.conf import settings
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
