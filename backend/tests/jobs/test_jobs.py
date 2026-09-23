"""Background jobs: the housekeeping tasks and the periodic scheduler."""

import datetime

import pytest
from django.contrib.sessions.models import Session
from django.core.management import call_command
from django.test import Client
from django.utils import timezone
from django_tasks_db.models import DBTaskResult

from accounts.models import Device
from jobs import tasks
from jobs.models import ScheduledRun
from jobs.scheduler import PERIODIC_JOBS, Periodic, enqueue_due
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db

DAY = datetime.timedelta(days=1)
NOW = datetime.datetime(2026, 9, 23, 3, 0, tzinfo=datetime.UTC)


def queued(task) -> int:
    return DBTaskResult.objects.filter(task_path=task.module_path).count()


# ---------------------------------------------------------------- housekeeping


def test_clear_expired_sessions_removes_ended_sessions_and_their_devices():
    user = UserFactory()
    for _ in range(2):
        Client().force_login(user)
    ended, live = Device.objects.order_by("created_at")
    Session.objects.filter(session_key=ended.session_key).update(
        expire_date=timezone.now() - datetime.timedelta(seconds=1)
    )

    removed = tasks.clear_expired_sessions.call()

    assert removed == 1
    assert list(Device.objects.all()) == [live]
    assert Session.objects.filter(session_key=live.session_key).exists()


def test_prune_task_results_runs():
    tasks.prune_task_results.call()  # the command it wraps must accept these options


# ---------------------------------------------------------------- scheduler


def test_housekeeping_runs_daily():
    assert {(job.task, job.every) for job in PERIODIC_JOBS} == {
        (tasks.clear_expired_sessions, DAY),
        (tasks.prune_task_results, DAY),
    }


def test_a_job_is_enqueued_the_first_time_the_scheduler_sees_it():
    job = Periodic(tasks.clear_expired_sessions, every=DAY)

    assert enqueue_due([job], now=NOW) == [job.name]
    assert queued(job.task) == 1


def test_a_job_is_not_enqueued_again_before_its_interval():
    job = Periodic(tasks.clear_expired_sessions, every=DAY)
    enqueue_due([job], now=NOW)

    assert enqueue_due([job], now=NOW + DAY - datetime.timedelta(minutes=1)) == []
    assert enqueue_due([job], now=NOW + DAY) == [job.name]
    assert queued(job.task) == 2


def test_the_last_run_survives_a_scheduler_restart():
    job = Periodic(tasks.clear_expired_sessions, every=DAY)
    enqueue_due([job], now=NOW)

    # A new scheduler process only has the database to go on.
    assert ScheduledRun.objects.get(name=job.name).last_enqueued_at == NOW
    assert enqueue_due([job], now=NOW + datetime.timedelta(hours=1)) == []


def test_each_job_keeps_its_own_schedule():
    daily = Periodic(tasks.clear_expired_sessions, every=DAY)
    hourly = Periodic(tasks.prune_task_results, every=datetime.timedelta(hours=1))
    enqueue_due([daily, hourly], now=NOW)

    later = NOW + datetime.timedelta(hours=2)

    assert enqueue_due([daily, hourly], now=later) == [hourly.name]


@pytest.mark.django_db(transaction=True)  # the worker closes connections between jobs
def test_enqueued_jobs_run_in_the_worker():
    enqueue_due(now=NOW)

    call_command("db_worker", batch=True, verbosity=0)

    results = DBTaskResult.objects.all()
    assert results.count() == len(PERIODIC_JOBS)
    assert {result.status for result in results} == {"SUCCESSFUL"}
