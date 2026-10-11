"""What a person sees when the server fails, and what the admin finds in the log."""

import pytest
from django.conf import settings

pytestmark = pytest.mark.django_db


def test_an_unexpected_error_answers_without_its_details(api, world, monkeypatch, caplog):
    def broken(*args, **kwargs):
        raise RuntimeError("secret detail from inside the server")

    monkeypatch.setattr("graph.api.paths_to", broken)

    response = api.login(world.ela).get(f"/graph/paths/{world.emma.pk}")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}
    # The admin finds the whole story in the server's log.
    assert "secret detail from inside the server" in caplog.text
    assert any(record.exc_info for record in caplog.records)


def test_errors_are_written_to_the_server_log_without_debug():
    # Django's default sends errors only to ADMINS by email when DEBUG is off; FolkBook's
    # log is the container's output (docker compose logs), so errors go to the console.
    root = settings.LOGGING["root"]
    assert root["level"] in {"WARNING", "INFO"}
    handlers = [settings.LOGGING["handlers"][name] for name in root["handlers"]]
    assert any(handler["class"] == "logging.StreamHandler" for handler in handlers)
