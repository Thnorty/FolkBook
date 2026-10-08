from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import BaseModel
from spaces.models import Space


class ApiKey(BaseModel):
    """A personal API key: what it may reach, and when it was last used. Only a hash of
    the key is kept; the key itself is shown once, when it's made."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="api_keys"
    )
    name = models.CharField(max_length=60)
    hashed = models.CharField(max_length=64, unique=True)
    last_five = models.CharField(max_length=5)
    read_only = models.BooleanField(default=True)
    include_private = models.BooleanField(default=False)
    # Its own field, so a key whose spaces were all deleted sees nothing rather than
    # everything: no spaces left is never read as "all spaces".
    limited = models.BooleanField(default=False)
    spaces = models.ManyToManyField(Space, blank=True, related_name="+")
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    # The rate limit: requests counted since window_start.
    window_start = models.DateTimeField(null=True, blank=True)
    window_count = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return self.name

    @property
    def expired(self) -> bool:
        return self.expires_at is not None and self.expires_at <= timezone.now()
