import pytest
from django.db.utils import OperationalError
from ninja.testing import TestClient

from config.api import api

client = TestClient(api)


@pytest.mark.django_db
def test_health_reports_ok_when_database_is_reachable():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_unavailable_database(monkeypatch):
    def broken_cursor():
        raise OperationalError("connection refused")

    monkeypatch.setattr("config.api.connection.cursor", broken_cursor)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "unavailable"}


def test_about_says_the_version_and_where_the_source_is(client, settings):
    settings.FOLKBOOK_SOURCE_URL = "https://example.com/my-fork"

    body = client.get("/api/about").json()

    assert body == {
        "version": settings.FOLKBOOK_VERSION,
        "source_url": "https://example.com/my-fork",
    }
    assert body["version"].count(".") == 2  # read from pyproject.toml, e.g. "0.1.0"
