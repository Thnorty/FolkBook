"""Reminder email jobs. `queue_digests` is enqueued by jobs.scheduler every few minutes."""

import datetime

from django.db import transaction
from django.tasks import task
from django.utils import timezone

from accounts.models import User
from mail.services import email_ready
from reminders import services
from reminders.digest import digest_due
from reminders.models import ReminderSettings


@task
def queue_digests() -> int:
    """A job for everyone whose digest is due now, in their own time zone. Returns how many."""
    if not email_ready():
        return 0
    now = timezone.now()
    queued = 0
    for user in User.objects.filter(is_active=True).select_related("reminder_settings"):
        prefs = getattr(user, "reminder_settings", None) or ReminderSettings(user=user)
        if on := digest_due(prefs, now):
            send_digest.enqueue(str(user.pk), on.isoformat())
            queued += 1
    return queued


@task
def send_digest(user_id: str, on: str) -> bool:
    """One user's digest for their date `on`. Safe to run twice: once a day is done, it's
    done (also when there was nothing to send). Returns whether an email went."""
    day = datetime.date.fromisoformat(on)
    with transaction.atomic():
        user = User.objects.filter(pk=user_id, is_active=True).first()
        if user is None:
            return False
        ReminderSettings.objects.get_or_create(user=user)
        prefs = ReminderSettings.objects.select_for_update().get(user=user)
        if prefs.digest == ReminderSettings.Digest.OFF or prefs.last_digest_on == day:
            return False
        sent = services.send_digest(user, prefs, day)
        prefs.last_digest_on = day
        prefs.save(update_fields=["last_digest_on", "updated_at"])
    return sent
