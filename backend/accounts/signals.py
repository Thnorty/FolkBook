"""Keep the signed-in devices list in step with every login and logout (API or admin)."""

from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.dispatch import receiver

from accounts.services import forget_device, remember_device


@receiver(user_logged_in)
def on_login(sender, request, user, **kwargs):
    if request is not None and hasattr(request, "session"):
        remember_device(request, user)


@receiver(user_logged_out)
def on_logout(sender, request, user, **kwargs):
    if request is not None and hasattr(request, "session"):
        forget_device(request)
