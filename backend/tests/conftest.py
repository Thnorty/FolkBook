import pytest

# Shared fixtures: `world` (multi-user sample data) and `api` (JSON client for the API).
pytest_plugins = ["tests.worlds", "tests.api_client"]


@pytest.fixture(autouse=True)
def fast_password_hashing(settings):
    # Real hashers are slow on purpose; tests don't need that.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture(autouse=True)
def media_in_temp_folder(settings, tmp_path):
    # Uploaded photos go to a throwaway folder, never the real media folder.
    settings.MEDIA_ROOT = tmp_path / "media"
