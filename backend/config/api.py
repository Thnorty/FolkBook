from django.core.exceptions import PermissionDenied, ValidationError
from django.db import DatabaseError, connection
from ninja import NinjaAPI, Schema
from ninja.security import django_auth

from core.api import Conflict, validation_detail
from people.api import router as people_router
from spaces.api import router as spaces_router

# Every endpoint needs a logged-in user unless it says `auth=None`.
api = NinjaAPI(title="FolkBook API", version="0.1.0", auth=django_auth)
api.add_router("/people", people_router)
api.add_router("/spaces", spaces_router)


@api.exception_handler(PermissionDenied)
def permission_denied(request, exc):
    message = str(exc) or "You don't have permission to do that."
    return api.create_response(request, {"detail": message}, status=403)


@api.exception_handler(ValidationError)
def validation_error(request, exc):
    return api.create_response(request, {"detail": validation_detail(exc)}, status=422)


@api.exception_handler(Conflict)
def conflict(request, exc):
    return api.create_response(request, {"detail": str(exc)}, status=409)


class HealthOut(Schema):
    status: str
    database: str


@api.get("/health", response=HealthOut, tags=["system"], auth=None)
def health(request):
    """Report whether the API is up and can reach the database."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        database = "ok"
    except DatabaseError:
        database = "unavailable"
    return {"status": "ok", "database": database}
