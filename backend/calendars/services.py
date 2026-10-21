"""Private calendar links: making them, and revoking them."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import transaction

from access.policy import Access
from calendars.models import CalendarFeed
from calendars.schemas import CalendarFeedIn
from core.tokens import hash_token, new_token
from spaces.services import picked_spaces

PREFIX = "fb_cal_"


def feed_url(token: str) -> str:
    return f"{settings.FOLKBOOK_URL}/api/calendars/feed/{token}.ics"


@transaction.atomic
def create_feed(access: Access, data: CalendarFeedIn) -> tuple[CalendarFeed, str]:
    """A new link and its token, which is never stored or shown again."""
    name = data.name.strip()
    if not name:
        raise ValidationError({"name": "Give the link a name."})
    spaces = picked_spaces(access, data.space_ids, all_label="Everyone you can see")
    token = new_token(PREFIX)
    feed = CalendarFeed.objects.create(
        owner=access.user,
        name=name,
        hashed=hash_token(token),
        last_five=token[-5:],
        limited=spaces is not None,
    )
    if spaces:
        feed.spaces.set(spaces)
    return feed, token


def revoke_feed(feed: CalendarFeed) -> None:
    """Calendars using it stop updating right away."""
    feed.delete()
