from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import DatabaseError, connection
from ninja import NinjaAPI, Schema
from ninja.security import django_auth

from accounts.api import router as auth_router
from accounts.api import users_router
from core.api import Conflict, validation_detail
from exports.api import router as export_router
from graph.api import router as graph_router
from imports.api import router as imports_router
from interactions.api import router as interactions_router
from invites.api import router as invites_router
from invites.api import setup_router
from people.api import memory_aids_router
from people.api import router as people_router
from relationships.api import router as relationships_router
from reminders.api import router as reminders_router
from search.api import router as search_router
from spaces.api import router as spaces_router
from today.api import router as today_router

# Every endpoint needs a logged-in user unless it says `auth=None`.
api = NinjaAPI(title="FolkBook API", version="0.1.0", auth=django_auth)
api.add_router("/setup", setup_router)
api.add_router("/auth", auth_router)
api.add_router("/users", users_router)
api.add_router("/invites", invites_router)
api.add_router("/people", people_router)
api.add_router("/spaces", spaces_router)
api.add_router("/relationships", relationships_router)
api.add_router("/graph", graph_router)
# Private to each user:
api.add_router("/memory-aids", memory_aids_router)
api.add_router("/interactions", interactions_router)
api.add_router("/keep-in-touch", reminders_router)
api.add_router("/today", today_router)
api.add_router("/search", search_router)
api.add_router("/export", export_router)
api.add_router("/imports", imports_router)


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


class AboutOut(Schema):
    version: str
    source_url: str  # where to get this server's source code (AGPL)


@api.get("/about", response=AboutOut, tags=["system"], auth=None)
def about(request):
    """Which FolkBook this is, and where its source code is."""
    return {"version": settings.FOLKBOOK_VERSION, "source_url": settings.FOLKBOOK_SOURCE_URL}


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
