"""Keep-in-touch settings and the reminder email. Private to the user; writes check the
permission layer."""

import datetime
import logging
import smtplib
from typing import Any

from django.core.exceptions import PermissionDenied

from access.policy import Access, can_write_private, visible_interactions
from accounts.models import User
from core.api import Conflict
from interactions.services import log_interaction
from mail import services as mail
from people.models import Person
from reminders import digest
from reminders.models import KeepInTouch, ReminderSettings
from reminders.nudges import settings_for
from reminders.schemas import ReminderSettingsSchema

logger = logging.getLogger("folkbook")

# What "We talked" logs, here and on Today: a timeline entry of its own kind.
TALKED = {"kind": "custom", "label": "Talked"}


def save_keep_in_touch(access: Access, person: Person, data: dict[str, Any]) -> KeepInTouch:
    if not can_write_private(access, person):
        raise PermissionDenied("This access can't change reminders.")
    setting, _ = KeepInTouch.objects.update_or_create(
        user=access.user, person=person, defaults=data
    )
    return setting


def save_settings(access: Access, data: dict[str, Any]) -> ReminderSettings:
    if access.read_only:
        raise PermissionDenied("This access can't change settings.")
    settings, _ = ReminderSettings.objects.update_or_create(user=access.user, defaults=data)
    return settings


def settings_out(user: User) -> dict:
    return {
        **ReminderSettingsSchema.model_validate(settings_for(user)).model_dump(),
        "email_ready": mail.email_ready(),
        "send_to": user.email,
    }


def send_digest(user: User, prefs: ReminderSettings, on: datetime.date) -> bool:
    """Email the digest for `on`, if there's anything in it. Returns whether it went."""
    found = digest.digest_for(user, on, prefs)
    if found.empty:
        return False
    _send(user, found, prefs)
    return True


def send_test_digest(user: User) -> dict:
    """Today's digest now, even an empty one, to see what it looks like."""
    if not mail.email_ready():
        raise Conflict("This server can't send email yet. Your admin can set it up.")
    prefs = settings_for(user)
    try:
        _send(user, digest.digest_for(user, digest.local_today(prefs), prefs), prefs)
    except (smtplib.SMTPException, OSError) as error:
        logger.warning("Test digest failed: %s", type(error).__name__)
        return {"ok": False, "message": "Couldn't send it. Your admin can check Settings → Email."}
    return {"ok": True, "message": f"Sent to {user.email}"}


def _send(user: User, found: digest.Digest, prefs: ReminderSettings) -> None:
    parts = digest.email(user, found, prefs)
    mail.send(
        user.email,
        parts["subject"],
        "digest",
        parts["context"],
        preview=parts["preview"],
        headers=parts["headers"],
    )


def log_talked(access: Access, person: Person) -> bool:
    """ "We talked" from an email: a timeline entry for today, once. False: already logged."""
    today = digest.local_today(settings_for(access.user))
    logged = visible_interactions(access).filter(person=person, occurred_on=today, **TALKED)
    if logged.exists():
        return False
    log_interaction(access, person, {**TALKED, "occurred_on": today})
    return True


def unsubscribe(user: User) -> None:
    """No more reminder emails. Security emails (password resets) still come."""
    ReminderSettings.objects.update_or_create(
        user=user, defaults={"digest": ReminderSettings.Digest.OFF}
    )
