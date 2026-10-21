from uuid import UUID

from django.db.models import Prefetch
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import visible_calendar_feeds, visible_spaces
from calendars import feed, services
from calendars.schemas import CalendarFeedIn, CalendarFeedOut, CreatedCalendarFeedOut
from core.api import access_for, not_found

router = Router(tags=["calendars"])


@router.get("", response=list[CalendarFeedOut])
@paginate(PageNumberPagination, page_size=50)
def list_calendar_feeds(request):
    """Your calendar links, newest first. The links themselves are never sent again."""
    access = access_for(request)
    spaces = Prefetch("spaces", queryset=visible_spaces(access))
    return visible_calendar_feeds(access).prefetch_related(spaces).order_by("-created_at")


@router.post("", response={201: CreatedCalendarFeedOut})
def create_calendar_feed(request, payload: CalendarFeedIn):
    """A new link. The response has the link itself: the only time it's sent."""
    feed, token = services.create_feed(access_for(request), payload)
    feed.url = services.feed_url(token)
    return Status(201, feed)


@router.delete("/{uuid:feed_id}", response={204: None})
def revoke_calendar_feed(request, feed_id: UUID):
    access = access_for(request)
    services.revoke_feed(get_object_or_404(visible_calendar_feeds(access), pk=feed_id))
    return Status(204, None)


@router.get("/feed/{token}.ics", auth=None, include_in_schema=False)
def calendar_feed(request, token: str):
    """The calendar itself, for calendar apps: they can't sign in, so the token in the link
    is the secret. A plain GET that changes nothing but "last used"."""
    found = feed.find_feed(token)
    if found is None:
        return not_found(request)
    now = timezone.now()
    feed.note_fetched(found, now)
    response = HttpResponse(feed.feed_text(found, now), content_type="text/calendar; charset=utf-8")
    response["Cache-Control"] = "private, max-age=3600"
    return response
