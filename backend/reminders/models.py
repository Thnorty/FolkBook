from django.conf import settings
from django.db import models

from core.models import BaseModel
from people.models import Person


class KeepInTouch(BaseModel):
    """A user's keep-in-touch settings for one person. Private to the user.

    Without a row, the user's default interval applies.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="keep_in_touch")
    interval_days = models.PositiveSmallIntegerField(
        null=True, blank=True, help_text="Empty means the user's default interval."
    )
    snoozed_until = models.DateField(null=True, blank=True)
    stopped = models.BooleanField(default=False, help_text="“Stop reminding me”.")

    class Meta:
        verbose_name_plural = "keep in touch settings"
        constraints = [
            models.UniqueConstraint(fields=["user", "person"], name="reminders_one_per_person"),
            models.CheckConstraint(
                condition=models.Q(interval_days__isnull=True) | models.Q(interval_days__gte=1),
                name="reminders_interval_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"Keep in touch with {self.person}"
