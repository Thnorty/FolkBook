import pytest

# Shared fixtures: `world`, the multi-user sample data used by privacy and graph tests.
pytest_plugins = ["tests.worlds"]


@pytest.fixture(autouse=True)
def fast_password_hashing(settings):
    # Real hashers are slow on purpose; tests don't need that.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
