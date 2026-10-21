"""Personal API keys: making them, and revoking them."""

import datetime
import math

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from access.policy import Access
from api_keys.models import ApiKey
from api_keys.schemas import ApiKeyIn
from core.tokens import hash_token, new_token
from spaces.services import picked_spaces

PREFIX = "fb_live_"
RATE_LIMIT = 120
WINDOW = datetime.timedelta(minutes=1)
EXPIRY = {
    "30d": datetime.timedelta(days=30),
    "90d": datetime.timedelta(days=90),
    "1y": datetime.timedelta(days=365),
    "never": None,
}


@transaction.atomic
def create_api_key(access: Access, data: ApiKeyIn) -> tuple[ApiKey, str]:
    """A new key and the key itself, which is never stored or shown again."""
    name = data.name.strip()
    if not name:
        raise ValidationError({"name": "Give the key a name."})
    spaces = picked_spaces(access, data.space_ids, all_label="All spaces")
    key = new_token(PREFIX)
    expires_in = EXPIRY[data.expires_in]
    api_key = ApiKey.objects.create(
        owner=access.user,
        name=name,
        hashed=hash_token(key),
        last_five=key[-5:],
        read_only=data.read_only,
        include_private=data.include_private,
        limited=spaces is not None,
        expires_at=timezone.now() + expires_in if expires_in else None,
    )
    if spaces:
        api_key.spaces.set(spaces)
    return api_key, key


class InvalidApiKey(Exception):
    """Unknown, expired, revoked, or its owner is disabled: all look the same from outside."""


class TooManyRequests(Exception):
    def __init__(self, retry_after: int):
        super().__init__(retry_after)
        self.retry_after = retry_after  # whole seconds until the window ends


def count_request(api_key: ApiKey, now: datetime.datetime | None = None) -> None:
    """Count one request against the key's minute, and note it was used. Each statement
    is atomic on its own, so the count is exact across server processes."""
    now = now or timezone.now()
    key = ApiKey.objects.filter(pk=api_key.pk)
    window_over = Q(window_start__isnull=True) | Q(window_start__lte=now - WINDOW)
    if key.filter(window_over).update(window_start=now, window_count=1, last_used_at=now):
        return
    if key.filter(window_count__lt=RATE_LIMIT).update(
        window_count=F("window_count") + 1, last_used_at=now
    ):
        return
    # Read again: other requests may have started the window since this one looked the
    # key up, or the key was revoked in between.
    start = key.values_list("window_start", flat=True).first()
    if start is None:
        raise InvalidApiKey
    left = (start + WINDOW - now).total_seconds()
    raise TooManyRequests(retry_after=max(1, math.ceil(left)))


def access_for_key(api_key: ApiKey) -> Access:
    """What a request signed in with this key may see and do."""
    space_ids = list(api_key.spaces.values_list("pk", flat=True)) if api_key.limited else None
    return Access.limited(
        api_key.owner,
        space_ids=space_ids,
        include_private=api_key.include_private,
        read_only=api_key.read_only,
    )


def revoke_api_key(api_key: ApiKey) -> None:
    """Anything using it stops working right away."""
    api_key.delete()
