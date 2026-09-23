"""Periodic jobs: what runs how often, and enqueuing whatever is due.

The scheduler (manage.py run_scheduler) calls `enqueue_due()` every few seconds.
Each job's last run is kept in the database and claimed with a row lock, so a
restart doesn't repeat a job early and two schedulers can't both enqueue it.
"""

import datetime
from dataclasses import dataclass

from django.db import transaction
from django.tasks import Task
from django.utils import timezone

from jobs import tasks
from jobs.models import ScheduledRun


@dataclass(frozen=True)
class Periodic:
    task: Task
    every: datetime.timedelta

    @property
    def name(self) -> str:
        return self.task.module_path


PERIODIC_JOBS = [
    Periodic(tasks.clear_expired_sessions, every=datetime.timedelta(days=1)),
    Periodic(tasks.prune_task_results, every=datetime.timedelta(days=1)),
]


def enqueue_due(
    jobs: list[Periodic] = PERIODIC_JOBS, now: datetime.datetime | None = None
) -> list[str]:
    """Enqueue every job whose interval has passed. Returns the names enqueued."""
    now = now or timezone.now()
    enqueued = []
    for job in jobs:
        with transaction.atomic():
            ScheduledRun.objects.get_or_create(name=job.name)
            run = ScheduledRun.objects.select_for_update().get(name=job.name)
            if run.last_enqueued_at and now - run.last_enqueued_at < job.every:
                continue
            job.task.enqueue()
            run.last_enqueued_at = now
            run.save(update_fields=["last_enqueued_at"])
            enqueued.append(job.name)
    return enqueued
