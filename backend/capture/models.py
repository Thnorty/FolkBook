from django.conf import settings
from django.db import models

from core.models import BaseModel


class Capture(BaseModel):
    """What one Quick capture saved, so "Undo all of this" can take it back.

    Ids and old values only, never the text the user wrote. Kept for a day.
    """

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    # The ids of what was created, as strings.
    people = models.JSONField(default=list)
    relationships = models.JSONField(default=list)
    memory_aids = models.JSONField(default=list)
    interactions = models.JSONField(default=list)
    # Fields changed on people the user already had: [{person, field, before, after}].
    changes = models.JSONField(default=list)
    undone_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"Capture by {self.owner} at {self.created_at}"
