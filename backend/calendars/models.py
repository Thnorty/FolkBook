from django.conf import settings
from django.db import models

from core.models import BaseModel
from spaces.models import Space


class CalendarFeed(BaseModel):
    """A private calendar link: whose birthdays it shows. Only a hash of its token is kept;
    the link itself is shown once, when it's made."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="calendar_feeds"
    )
    name = models.CharField(max_length=60)
    hashed = models.CharField(max_length=64, unique=True)
    last_five = models.CharField(max_length=5)
    # Its own field, so a link whose spaces were all deleted shows nobody rather than
    # everybody: no spaces left is never read as "all spaces".
    limited = models.BooleanField(default=False)
    spaces = models.ManyToManyField(Space, blank=True, related_name="+")
    last_fetched_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.name
