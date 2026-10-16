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


class ReminderSettings(BaseModel):
    """A user's reminder settings for everyone: nudges and the email digest. Without a row,
    the defaults apply."""

    class Digest(models.TextChoices):
        OFF = "off"
        DAILY = "daily"
        WEEKLY = "weekly"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminder_settings"
    )
    nudges_on = models.BooleanField(default=True, help_text="Keep-in-touch nudges on Today.")
    default_interval_days = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        help_text="For people without their own interval. Empty: only those with one.",
    )
    digest = models.CharField(max_length=10, choices=Digest.choices, default=Digest.WEEKLY)
    digest_weekday = models.PositiveSmallIntegerField(default=0, help_text="0 is Monday.")
    include_memory_aids = models.BooleanField(default=True)
    birthdays_days_before = models.PositiveSmallIntegerField(
        null=True, blank=True, default=3, help_text="Empty: no birthdays in emails."
    )
    # The user's own time zone (from their browser), for "08:00" and for what "today" is.
    time_zone = models.CharField(max_length=64, blank=True)
    last_digest_on = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "reminder settings"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(default_interval_days__isnull=True)
                | models.Q(default_interval_days__gte=1),
                name="reminders_default_interval_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(digest_weekday__lte=6), name="reminders_digest_weekday"
            ),
        ]

    def __str__(self) -> str:
        return f"Reminder settings of {self.user}"
