from django.conf import settings
from django.db import models

from core.models import BaseModel


class Import(BaseModel):
    """One .vcf import: which file and when. The people it added point back to it
    (`Person.added_by_import`), so it can be shown or undone later."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="imports"
    )
    file_name = models.CharField(max_length=255)
    undone_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.file_name
