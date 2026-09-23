"""Signing in and out, passwords and signed-in devices."""

import datetime

from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.http import HttpRequest
from django.utils import timezone

from accounts.models import Device, FailedLogin, User
from core.http import client_ip

# At most this many wrong passwords per email in the window, then wait.
MAX_FAILED_LOGINS = 10
FAILED_LOGIN_WINDOW = datetime.timedelta(minutes=15)
# Remembered sessions last this long; others end when the browser closes.
REMEMBER_FOR = datetime.timedelta(days=30)
# Don't write "last seen" on every request.
LAST_SEEN_EVERY = datetime.timedelta(minutes=5)


class WrongCredentials(Exception):
    pass


class TooManyAttempts(Exception):
    pass


def sign_in(request: HttpRequest, email: str, password: str, remember: bool) -> User:
    email = email.strip().lower()
    recent_failures = FailedLogin.objects.filter(
        email=email, at__gte=timezone.now() - FAILED_LOGIN_WINDOW
    )
    if recent_failures.count() >= MAX_FAILED_LOGINS:
        raise TooManyAttempts
    user = authenticate(request, username=email, password=password)
    if user is None:
        FailedLogin.objects.create(email=email, ip=client_ip(request))
        raise WrongCredentials
    FailedLogin.objects.filter(email=email).delete()
    login(request, user)
    request.session.set_expiry(REMEMBER_FOR if remember else 0)
    return user


def sign_out(request: HttpRequest) -> None:
    logout(request)  # the user_logged_out signal forgets the device


def change_password(request: HttpRequest, current: str, new: str) -> None:
    """Change the password, keep this session, and sign out everywhere else."""
    user = request.user
    if not user.check_password(current):
        raise ValidationError({"current_password": "That's not your current password."})
    validate_password(new, user)
    user.set_password(new)
    user.save(update_fields=["password"])
    update_session_auth_hash(request, user)
    sign_out_other_devices(user, keep=request.session.session_key)


def active_devices(user: User):
    live_sessions = Session.objects.filter(expire_date__gt=timezone.now())
    return Device.objects.filter(
        user=user, session_key__in=live_sessions.values("session_key")
    ).order_by("-last_seen")


def sign_out_device(device: Device) -> None:
    Session.objects.filter(session_key=device.session_key).delete()
    device.delete()


def sign_out_other_devices(user: User, keep: str | None) -> None:
    for device in Device.objects.filter(user=user).exclude(session_key=keep):
        sign_out_device(device)


def remember_device(request: HttpRequest, user: User) -> None:
    """Called on every login (API or admin) through the user_logged_in signal."""
    if request.session.session_key is None:
        # Switching accounts in the same browser flushes the session, leaving no key yet.
        request.session.save()
    Device.objects.update_or_create(
        session_key=request.session.session_key,
        defaults={
            "user": user,
            "user_agent": request.META.get("HTTP_USER_AGENT", "")[:300],
            "ip": client_ip(request),
            "last_seen": timezone.now(),
        },
    )


def forget_device(request: HttpRequest) -> None:
    Device.objects.filter(session_key=request.session.session_key).delete()


def touch_device(request: HttpRequest) -> None:
    now = timezone.now()
    Device.objects.filter(
        session_key=request.session.session_key, last_seen__lt=now - LAST_SEEN_EVERY
    ).update(last_seen=now, ip=client_ip(request))
