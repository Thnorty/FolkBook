import pytest

# Shared fixtures: `world` (multi-user sample data), `api` (JSON client for the API),
# `stub_ai` (a stand-in AI server), and `fake_smtp` and `email_ready` (email).
pytest_plugins = ["tests.worlds", "tests.api_client", "tests.ai.stub", "tests.mail.fixtures"]


@pytest.fixture(autouse=True)
def fast_password_hashing(settings):
    # Real hashers are slow on purpose; tests don't need that.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture(autouse=True)
def media_in_temp_folder(settings, tmp_path):
    # Uploaded photos go to a throwaway folder, never the real media folder.
    settings.MEDIA_ROOT = tmp_path / "media"


@pytest.fixture(autouse=True)
def no_email_unless_asked(settings):
    # A developer's own FOLKBOOK_SMTP_* never reaches tests; `email_ready` sets one up.
    settings.FOLKBOOK_SMTP = None
