from django.conf import settings
from django.db import models

from core.models import BaseModel
from people.models import Person


class Interaction(BaseModel):
    """A timeline entry: you met, called or messaged someone. Private to the author."""

    class InteractionKind(models.TextChoices):
        MET = "met"
        CALL = "call"
        MESSAGE = "message"
        EVENT = "event"
        CUSTOM = "custom"

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="interactions")
    kind = models.CharField(max_length=10, choices=InteractionKind.choices)
    label = models.CharField(max_length=100, blank=True, help_text="Title, e.g. “Coffee”.")
    occurred_on = models.DateField()
    note = models.TextField(blank=True)

    class Meta:
        ordering = ["-occurred_on", "-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(kind="custom") | ~models.Q(label=""),
                name="interactions_custom_needs_label",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} with {self.person} on {self.occurred_on}"
