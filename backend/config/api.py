from django.db import DatabaseError, connection
from ninja import NinjaAPI, Schema

api = NinjaAPI(title="FolkBook API", version="0.1.0")


class HealthOut(Schema):
    status: str
    database: str


@api.get("/health", response=HealthOut, tags=["system"])
def health(request):
    """Report whether the API is up and can reach the database."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        database = "ok"
    except DatabaseError:
        database = "unavailable"
    return {"status": "ok", "database": database}
