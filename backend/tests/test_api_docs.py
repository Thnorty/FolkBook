import pytest

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("path", ["/api/docs", "/api/openapi.json", "/api/health"])
def test_public_api_pages_need_no_login(client, path):
    assert client.get(path).status_code == 200


def test_the_openapi_spec_lists_the_notebook_endpoints(client):
    paths = client.get("/api/openapi.json").json()["paths"]

    assert {"/api/people", "/api/people/{person_id}", "/api/spaces"} <= set(paths)
