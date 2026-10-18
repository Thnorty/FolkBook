"""The links in reminder emails, used without logging in (`reminders.links`). Looking
changes nothing; the POST that the confirmation page sends does."""

from ninja import Router, Schema, Status

from core.api import ErrorOut
from people.schemas import PersonRef
from reminders import links, services

router = Router(tags=["email links"])

BROKEN = {"detail": "This link doesn't work anymore. Open FolkBook to do it there."}


class UnsubscribeOut(Schema):
    email: str
    subscribed: bool  # False: already unsubscribed


class TalkedOut(Schema):
    person: PersonRef


class TalkedLoggedOut(Schema):
    logged: bool  # False: today's "Talked" was already on the timeline


@router.get("/unsubscribe/{token}", response={200: UnsubscribeOut, 404: ErrorOut}, auth=None)
def preview_unsubscribe(request, token: str):
    user = links.unsubscribing(token)
    if user is None:
        return Status(404, BROKEN)
    return {"email": user.email, "subscribed": services.settings_out(user)["digest"] != "off"}


@router.post("/unsubscribe/{token}", response={204: None, 404: ErrorOut}, auth=None)
def unsubscribe(request, token: str):
    """Also the email apps' one-click unsubscribe (RFC 8058), so no CSRF token."""
    user = links.unsubscribing(token)
    if user is None:
        return Status(404, BROKEN)
    services.unsubscribe(user)
    return Status(204, None)


@router.get("/we-talked/{token}", response={200: TalkedOut, 404: ErrorOut}, auth=None)
def preview_talked(request, token: str):
    found = links.talked(token)
    if found is None:
        return Status(404, BROKEN)
    return {"person": found[1]}


@router.post("/we-talked/{token}", response={200: TalkedLoggedOut, 404: ErrorOut}, auth=None)
def log_talked(request, token: str):
    found = links.talked(token)
    if found is None:
        return Status(404, BROKEN)
    return {"logged": services.log_talked(*found)}
