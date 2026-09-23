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
