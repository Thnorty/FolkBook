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
    # Kept as numbers: the people themselves may be deleted later, or undone.
    added = models.PositiveIntegerField(default=0)
    merged = models.PositiveIntegerField(default=0)
    # When it was done: what the user writes about its people after this is theirs.
    finished_at = models.DateTimeField(null=True, blank=True)
    undone_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.file_name


class Merge(BaseModel):
    """What an import's merge added to someone already in the book, so undoing the import
    can take it back out (leaving anything changed since). The contact details it added
    point to the import themselves (`ContactMethod.added_by_import`)."""

    batch = models.ForeignKey(Import, on_delete=models.CASCADE, related_name="merges")
    person = models.ForeignKey("people.Person", on_delete=models.CASCADE, related_name="+")
    # Fields that were empty and got the contact's value: {"work": …, "birthday":
    # [day, month, year], "photo": file name}.
    filled = models.JSONField(default=dict)
    note = models.TextField(blank=True)  # the text added to the user's note, as added
    # What undoing the import took back out (only what was still as the import left it),
    # so bringing the import back puts back exactly that. Empty while it isn't undone.
    taken_back = models.JSONField(null=True, blank=True)
