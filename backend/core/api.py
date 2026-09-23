"""Shared API plumbing: who is asking, and the errors endpoints can raise.

Every error response has the shape {"detail": ...}: a message string, or for
422 validation errors a list of {"loc": [...], "msg": "..."}, like Ninja's own.
"""

from django.core.exceptions import PermissionDenied, ValidationError
from django.http import HttpRequest
from ninja import Schema
from ninja.utils import check_csrf

from access.policy import Access


def access_for(request: HttpRequest) -> Access:
    """The Access for this request. API keys (#38) will plug in here."""
    return Access.for_user(request.auth)


def require_csrf(request: HttpRequest) -> None:
    """CSRF check for endpoints used before logging in (login, sign-up, first run).

    Logged-in endpoints get this from Ninja's session auth already.
    """
    if check_csrf(request):
        raise PermissionDenied("CSRF check failed. Reload the page and try again.")


class Conflict(Exception):
    """The request clashes with existing data (e.g. a duplicate space name)."""


def validation_detail(error: ValidationError) -> list[dict]:
    if hasattr(error, "error_dict"):
        return [
            {"loc": ["body", field], "msg": message}
            for field, messages in error.message_dict.items()
            for message in messages
        ]
    return [{"loc": ["body"], "msg": message} for message in error.messages]


class ErrorOut(Schema):
    detail: str
