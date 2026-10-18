"""Account jobs, run by the worker."""

from django.conf import settings
from django.db import transaction
from django.tasks import task
from django.utils import timezone

from accounts.models import PasswordReset
from core.secrets import unseal
from mail.services import send


@task
def send_reset_email(reset_id: str, sealed_token: str) -> None:
    """Email a reset link (screen 7b). Safe to run twice: a link is emailed once, and
    never after it was used, replaced or ran out."""
    token = unseal(sealed_token)
    with transaction.atomic():
        reset = (
            PasswordReset.objects.select_for_update()
            .select_related("user")
            .filter(pk=reset_id, emailed_at=None, used_at=None, expires_at__gt=timezone.now())
            .first()
        )
        if reset is None or token is None:
            return
        send(
            reset.user.email,
            "Reset your FolkBook password",
            "reset",
            {"email": reset.user.email, "link": f"{settings.FOLKBOOK_URL}/reset/{token}"},
            preview="This link works once and expires in 1 hour.",
        )
        reset.emailed_at = timezone.now()
        reset.save(update_fields=["emailed_at", "updated_at"])
