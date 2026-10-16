import pytest

from tests.mail.fake_smtp import fake_smtp  # noqa: F401 — a fixture

ENVIRONMENT = {
    "host": "smtp.example.net",
    "port": 587,
    "security": "starttls",
    "username": "folkbook",
    "password": "env-password-1234",
    "from_address": "FolkBook <folkbook@example.net>",
}


@pytest.fixture
def email_ready(settings):
    """Email set up through the environment. Tests send to `mailoutbox`, never a server."""
    settings.FOLKBOOK_SMTP = dict(ENVIRONMENT)
    settings.FOLKBOOK_URL = "https://folk.example.net"
    return settings.FOLKBOOK_SMTP


@pytest.fixture
def run_jobs_now(settings):
    """Jobs run as soon as they're enqueued, instead of waiting for the worker."""
    settings.TASKS = {"default": {"BACKEND": "django.tasks.backends.immediate.ImmediateBackend"}}
