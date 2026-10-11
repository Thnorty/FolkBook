from django.conf import settings
from django.db import models
from django.db.models import Q

from core.models import BaseModel


class AiProvider(BaseModel):
    """Where Quick capture sends its text: someone's own AI, or the server's for everyone.

    `key` is sealed (`core.secrets`); it never leaves the server.
    """

    class Kind(models.TextChoices):
        GEMINI = "gemini", "Gemini"
        OPENAI_COMPATIBLE = "openai_compatible", "OpenAI-compatible"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="ai_provider",
    )
    for_server = models.BooleanField(default=False)
    provider = models.CharField(max_length=20, choices=Kind.choices)
    # Not a URLField: local servers have bare host names (http://ollama:11434/v1).
    base_url = models.CharField(max_length=500, blank=True)
    model = models.CharField(max_length=200)
    key = models.TextField(blank=True)
    set_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["for_server"], condition=Q(for_server=True), name="ai_one_server_provider"
            ),
            models.CheckConstraint(
                condition=Q(for_server=True, user__isnull=True)
                | Q(for_server=False, user__isnull=False),
                name="ai_provider_is_a_users_or_the_servers",
            ),
        ]

    def __str__(self) -> str:
        return f"{'server' if self.for_server else self.user}: {self.provider} {self.model}"
