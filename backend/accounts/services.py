"""Signing in and out, passwords and signed-in devices."""

import datetime
import hashlib
import secrets

from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.models import Session
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.db.models import Max
from django.db.models.functions import Lower
from django.http import HttpRequest
from django.utils import timezone

from accounts.models import Device, FailedLogin, PasswordReset, User
from core.api import Conflict
from core.http import client_ip

# At most this many wrong passwords per email in the window, then wait.
MAX_FAILED_LOGINS = 10
FAILED_LOGIN_WINDOW = datetime.timedelta(minutes=15)
# "Keep me logged in" should never run out. Browsers cap cookies at 400 days, so a
# remembered session is renewed for another 400 days whenever it's used.
# Sessions that aren't remembered end when the browser closes.
REMEMBER_FOR = datetime.timedelta(days=400)
# Reset links are handed over by an admin (by chat, in person), so they last a day.
RESET_LINK_LASTS = datetime.timedelta(hours=24)
# Don't write "last seen" on every request.
LAST_SEEN_EVERY = datetime.timedelta(minutes=5)


class WrongCredentials(Exception):
    pass


class TooManyAttempts(Exception):
    pass


def sign_in(request: HttpRequest, email: str, password: str, remember: bool) -> User:
    email = email.strip().lower()
    window_start = timezone.now() - FAILED_LOGIN_WINDOW
    if FailedLogin.objects.filter(email=email, at__gte=window_start).count() >= MAX_FAILED_LOGINS:
        raise TooManyAttempts
    user = authenticate(request, username=email, password=password)
    if user is None:
        # Failures only matter inside the window; drop older ones as we go, so
        # guesses at emails that never log in can't pile up.
        FailedLogin.objects.filter(at__lt=window_start).delete()
        FailedLogin.objects.create(email=email, ip=client_ip(request))
        raise WrongCredentials
    FailedLogin.objects.filter(email=email).delete()
    login(request, user)
    request.session.set_expiry(REMEMBER_FOR if remember else 0)
    return user


def create_account(
    request: HttpRequest, email: str, password: str, name: str, *, admin: bool = False
) -> User:
    """A new account (and its Me), logged in and remembered on this device."""
    email = User.objects.normalize_email(email.strip())
    try:
        validate_email(email)
    except ValidationError as error:
        raise ValidationError({"email": "That doesn't look like an email address."}) from error
    if User.objects.filter(email__iexact=email).exists():
        raise Conflict("There's already an account with this email. Log in instead.")
    _check_password_rules(password, User(email=email), field="password")
    create = User.objects.create_superuser if admin else User.objects.create_user
    user = create(email, password, name=name.strip())
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session.set_expiry(REMEMBER_FOR)
    return user


def sign_out(request: HttpRequest) -> None:
    logout(request)  # the user_logged_out signal forgets the device


def change_password(request: HttpRequest, current: str, new: str) -> None:
    """Change the password, keep this session, and sign out everywhere else."""
    user = request.user
    if not user.check_password(current):
        raise ValidationError({"current_password": "That's not your current password."})
    _check_password_rules(new, user, field="new_password")
    user.set_password(new)
    user.save(update_fields=["password"])
    update_session_auth_hash(request, user)
    sign_out_other_devices(user, keep=request.session.session_key)


def _check_password_rules(password: str, user: User, field: str) -> None:
    try:
        validate_password(password, user)
    except ValidationError as error:
        raise ValidationError({field: error.messages}) from error


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
    """Note that the device was used, and keep a remembered session from running out."""
    now = timezone.now()
    updated = Device.objects.filter(
        session_key=request.session.session_key, last_seen__lt=now - LAST_SEEN_EVERY
    ).update(last_seen=now, ip=client_ip(request))
    if updated and not request.session.get_expire_at_browser_close():
        request.session.set_expiry(REMEMBER_FOR)


# ---------------------------------------------------------------- password reset links


class ResetUnusable(Exception):
    """The reset link doesn't exist, was used, or expired. Callers say the same for all."""


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_reset_link(admin: User, user: User) -> tuple[PasswordReset, str]:
    """A new one-time link for `user`; returns it with its token (shown once).

    Older unused links for them stop working, so only the latest one counts.
    """
    if not admin.is_staff:
        raise PermissionDenied("Only an admin can make reset links.")
    now = timezone.now()
    PasswordReset.objects.filter(user=user, used_at=None, expires_at__gt=now).update(expires_at=now)
    token = secrets.token_urlsafe(24)
    reset = PasswordReset.objects.create(
        user=user, created_by=admin, token_hash=_hash(token), expires_at=now + RESET_LINK_LASTS
    )
    return reset, token


def usable_reset(token: str, *, lock: bool = False) -> PasswordReset:
    resets = PasswordReset.objects.select_related("user")
    if lock:
        resets = resets.select_for_update()
    reset = resets.filter(
        token_hash=_hash(token), used_at=None, expires_at__gt=timezone.now(), user__is_active=True
    ).first()
    if reset is None:
        raise ResetUnusable
    return reset


@transaction.atomic
def reset_password(token: str, password: str) -> None:
    """Set a new password with a reset link, once. Signs the user out everywhere."""
    reset = usable_reset(token, lock=True)
    _check_password_rules(password, reset.user, field="password")
    reset.user.set_password(password)
    reset.user.save(update_fields=["password"])
    sign_out_other_devices(reset.user, keep=None)
    reset.used_at = timezone.now()
    reset.save(update_fields=["used_at", "updated_at"])


# ---------------------------------------------------------------- managing users (admins)


def users_for(admin: User):
    """Everyone on the server, with when they were last active. Admins only."""
    if not admin.is_staff:
        raise PermissionDenied("Only an admin can manage users.")
    return (
        User.objects.select_related("me")
        .annotate(last_active=Max("devices__last_seen"))
        .order_by(Lower("email"))
    )


@transaction.atomic
def update_user(admin: User, user: User, changes: dict) -> User:
    """Make someone an admin (or not), or deactivate them (their book is kept)."""
    if not admin.is_staff:
        raise PermissionDenied("Only an admin can manage users.")
    if user.pk == admin.pk:
        raise Conflict("You can't change your own admin rights or deactivate yourself.")
    if "is_admin" in changes:
        user.is_staff = changes["is_admin"]
    if "is_active" in changes:
        user.is_active = changes["is_active"]
        if not user.is_active:
            sign_out_other_devices(user, keep=None)
    user.save(update_fields=["is_staff", "is_active"])
    return user
