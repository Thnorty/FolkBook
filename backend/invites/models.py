import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import BaseModel
from spaces.models import Space, SpaceMembership


def new_token() -> str:
    return secrets.token_urlsafe(24)


class Invite(BaseModel):
    """A link that lets someone create an account on this server.

    Admins can make plain invites. Anyone can make an invite that also shares
    one of their own spaces; it disappears if that space is deleted.
    """

    token = models.CharField(max_length=64, unique=True, default=new_token, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="invites_created"
    )
    expires_at = models.DateTimeField()
    max_uses = models.PositiveSmallIntegerField(default=1)
    uses = models.PositiveSmallIntegerField(default=0)
    space = models.ForeignKey(
        Space, on_delete=models.CASCADE, null=True, blank=True, related_name="invites"
    )
    role = models.CharField(
        max_length=10, choices=SpaceMembership.Role.choices, default=SpaceMembership.Role.VIEWER
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(max_uses__gte=1), name="invites_at_least_one_use"
            ),
            models.CheckConstraint(
                condition=models.Q(uses__lte=models.F("max_uses")),
                name="invites_not_used_more_than_allowed",
            ),
        ]

    def __str__(self) -> str:
        return f"Invite by {self.created_by} ({self.uses}/{self.max_uses})"

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @property
    def is_used_up(self) -> bool:
        return self.uses >= self.max_uses

    @property
    def is_usable(self) -> bool:
        return not (self.is_expired or self.is_used_up)
