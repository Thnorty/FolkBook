from django.conf import settings
from django.db import models
from django.db.models import Q

from core.models import BaseModel


class SmtpSettings(BaseModel):
    """The server's SMTP settings, saved by an admin. One row at most.

    Unused while FOLKBOOK_SMTP_HOST is set: the environment wins. `password` is sealed
    (`core.secrets`); it never leaves the server.
    """

    class Security(models.TextChoices):
        STARTTLS = "starttls", "STARTTLS"
        SSL = "ssl", "SSL / TLS"
        NONE = "none", "None"

    singleton = models.BooleanField(default=True, unique=True, editable=False)
    host = models.CharField(max_length=253)
    port = models.PositiveIntegerField(default=587)
    security = models.CharField(max_length=10, choices=Security.choices, default="starttls")
    username = models.CharField(max_length=254, blank=True)
    password = models.TextField(blank=True)
    from_address = models.CharField(max_length=320)
    set_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        verbose_name_plural = "SMTP settings"
        constraints = [
            models.CheckConstraint(condition=Q(singleton=True), name="mail_one_smtp_settings"),
        ]

    def __str__(self) -> str:
        return f"SMTP {self.host}:{self.port}"
