"""A JSON client for API tests: real URLs, middleware and session login."""

import json

import pytest
from django.test import Client


class ApiClient:
    def __init__(self, client):
        self._client = client

    def login(self, user) -> "ApiClient":
        self._client.force_login(user)
        return self

    def with_key(self, key: str, **client_options) -> "ApiClient":
        """A new client that signs in with an API key instead of the login cookie."""
        headers = {"Authorization": f"Bearer {key}"}
        return ApiClient(Client(headers=headers, **client_options))

    def get(self, path: str, **params):
        return self._client.get(f"/api{path}", params)

    def post(self, path: str, data=None):
        return self._send("post", path, data)

    def put(self, path: str, data=None):
        return self._send("put", path, data)

    def patch(self, path: str, data=None):
        return self._send("patch", path, data)

    def delete(self, path: str):
        return self._client.delete(f"/api{path}")

    def upload(self, path: str, data: dict):
        """POST as a form (multipart), for files."""
        return self._client.post(f"/api{path}", data)

    def _send(self, method: str, path: str, data):
        return getattr(self._client, method)(
            f"/api{path}", json.dumps(data or {}), content_type="application/json"
        )


@pytest.fixture
def api(client) -> ApiClient:
    """Not logged in; call `api.login(user)` first."""
    return ApiClient(client)
