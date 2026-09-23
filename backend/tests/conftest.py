import pytest


@pytest.fixture(autouse=True)
def fast_password_hashing(settings):
    # Real hashers are slow on purpose; tests don't need that.
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
