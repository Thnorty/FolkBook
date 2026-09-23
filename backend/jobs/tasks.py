"""Housekeeping jobs. Run by the worker; the periodic ones are enqueued by the scheduler."""

from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.tasks import task
from django.utils import timezone

from accounts.models import Device


@task
def clear_expired_sessions() -> int:
    """Delete ended sessions and the devices that belonged to them. Returns devices removed."""
    Session.objects.filter(expire_date__lte=timezone.now()).delete()
    live = Session.objects.values("session_key")
    removed, _ = Device.objects.exclude(session_key__in=live).delete()
    return removed


@task
def prune_task_results() -> None:
    """Forget finished jobs: successful ones after 14 days, failed ones after 90."""
    call_command("prune_db_task_results", min_age_days=14, failed_min_age_days=90, verbosity=0)
