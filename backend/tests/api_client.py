"""A JSON client for API tests: real URLs, middleware and session login."""

import json

import pytest


class ApiClient:
    def __init__(self, client):
        self._client = client

    def login(self, user) -> "ApiClient":
        self._client.force_login(user)
        return self

    def get(self, path: str, **params):
        return self._client.get(f"/api{path}", params)

    def post(self, path: str, data=None):
        return self._send("post", path, data)

    def patch(self, path: str, data=None):
        return self._send("patch", path, data)

    def delete(self, path: str):
        return self._client.delete(f"/api{path}")

    def _send(self, method: str, path: str, data):
        return getattr(self._client, method)(
            f"/api{path}", json.dumps(data or {}), content_type="application/json"
        )


@pytest.fixture
def api(client) -> ApiClient:
    """Not logged in; call `api.login(user)` first."""
    return ApiClient(client)
