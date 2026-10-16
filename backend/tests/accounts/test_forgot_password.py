"""Forgot password by email: a link that lasts an hour, the same answer for everyone, and a
job queue that never holds a working link."""

import datetime
import hashlib
import json
import re

import pytest
from django.test import Client
from django.utils import timezone
from django_tasks_db.models import DBTaskResult

from accounts import tasks
from accounts.models import PasswordReset
from core.secrets import unseal
from tests.accounts.test_password_reset import NEW_PASSWORD, reset
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@pytest.fixture
def tom():
    return UserFactory(email="tom@example.com")


def forgot(email: str, client: Client | None = None):
    return (client or Client()).post(
        "/api/auth/forgot-password", json.dumps({"email": email}), content_type="application/json"
    )


def link_in(message) -> str:
    return re.search(r"https://folk\.example\.net/reset/(\S+)", message.body).group(1)


def test_a_reset_link_is_emailed_and_lasts_an_hour(tom, email_ready, run_jobs_now, mailoutbox):
    response = forgot("Tom@Example.com ")

    assert response.status_code == 202
    [message] = mailoutbox
    assert message.to == ["tom@example.com"]
    assert message.subject == "Reset your FolkBook password"
    assert "You can't unsubscribe from security emails." in message.body
    token = link_in(message)
    assert f"https://folk.example.net/reset/{token}" in message.alternatives[0][0]
    link = PasswordReset.objects.get()
    assert link.created_by is None
    assert link.emailed_at is not None
    lasts = link.expires_at - timezone.now()
    assert datetime.timedelta(minutes=59) < lasts <= datetime.timedelta(hours=1)
    assert reset(token).status_code == 204
    tom.refresh_from_db()
    assert tom.check_password(NEW_PASSWORD)


@pytest.mark.parametrize("email", ["nobody@example.com", "gone@example.com"])
def test_the_answer_is_the_same_without_an_account(email, email_ready, run_jobs_now, mailoutbox):
    UserFactory(email="gone@example.com", is_active=False)

    response = forgot(email)

    assert response.status_code == 202
    assert mailoutbox == []
    assert not PasswordReset.objects.exists()


def test_without_email_the_admin_makes_links(tom, mailoutbox):
    response = forgot("tom@example.com")

    assert response.status_code == 409
    assert "Ask your admin" in response.json()["detail"]
    assert not PasswordReset.objects.exists()


def test_it_needs_the_csrf_token(tom, email_ready, run_jobs_now, mailoutbox):
    response = forgot("tom@example.com", Client(enforce_csrf_checks=True))

    assert response.status_code == 403
    assert mailoutbox == []


def test_at_most_five_emails_an_hour(tom, email_ready, run_jobs_now, mailoutbox):
    answers = {forgot("tom@example.com").status_code for _ in range(7)}

    assert answers == {202}
    assert len(mailoutbox) == 5


def test_a_new_email_replaces_the_older_link(tom, email_ready, run_jobs_now, mailoutbox):
    forgot("tom@example.com")
    forgot("tom@example.com")

    first, second = (link_in(message) for message in mailoutbox)
    assert reset(first).status_code == 404
    assert reset(second).status_code == 204


def test_the_job_queue_never_holds_a_working_link(tom, email_ready, mailoutbox):
    forgot("tom@example.com")  # the database queue: the worker would send it

    [job] = DBTaskResult.objects.all()
    reset_id, sealed = job.args_kwargs["args"]
    link = PasswordReset.objects.get()
    assert reset_id == str(link.pk)
    assert _hash(sealed) != link.token_hash
    assert _hash(unseal(sealed)) == link.token_hash
    assert mailoutbox == []


def test_the_job_is_safe_to_run_twice(tom, email_ready, mailoutbox):
    forgot("tom@example.com")
    [job] = DBTaskResult.objects.all()

    tasks.send_reset_email.call(*job.args_kwargs["args"])
    tasks.send_reset_email.call(*job.args_kwargs["args"])

    assert len(mailoutbox) == 1


@pytest.mark.parametrize("change", [{"used_at": timezone.now()}, {"expires_at": timezone.now()}])
def test_a_used_or_expired_link_is_not_emailed(tom, email_ready, mailoutbox, change):
    forgot("tom@example.com")
    [job] = DBTaskResult.objects.all()
    PasswordReset.objects.update(**change)

    tasks.send_reset_email.call(*job.args_kwargs["args"])

    assert mailoutbox == []
