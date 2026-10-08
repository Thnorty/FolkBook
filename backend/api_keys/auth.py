"""Signing in with an API key: `Authorization: Bearer fb_live_…`."""

from django.http import HttpRequest
from ninja.security import HttpBearer, django_auth

from accounts.models import User
from api_keys import services
from api_keys.models import ApiKey


class InvalidApiKey(Exception):
    """Unknown, expired, or its owner is disabled: all look the same from outside."""


class ApiKeyAuth(HttpBearer):
    def authenticate(self, request: HttpRequest, token: str) -> User:
        # Raised, never None: None would let the login cookie sign the request in
        # instead, with full access, when a logged-in browser sends a bad key.
        api_key = (
            ApiKey.objects.select_related("owner")
            .filter(hashed=services.hash_key(token), owner__is_active=True)
            .first()
        )
        if api_key is None or api_key.expired:
            raise InvalidApiKey
        request.api_access = services.access_for_key(api_key)
        return api_key.owner


api_key_auth = ApiKeyAuth()
# What most endpoints take; account-level ones take only the login cookie.
KEY_OR_LOGIN = [api_key_auth, django_auth]
