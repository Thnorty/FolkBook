"""Deleting someone: hidden at once, Undo for a minute, then deleted for good."""

import datetime

import pytest
from django.utils import timezone

from interactions.models import Interaction
from people import services, tasks
from people.models import Note, Person
from relationships.models import Relationship

pytestmark = pytest.mark.django_db

LATER = services.UNDO_WINDOW + datetime.timedelta(seconds=1)


@pytest.fixture
def oskar_deleted(api, world):
    assert api.login(world.ela).delete(f"/people/{world.oskar.pk}").status_code == 204
    return world.oskar


def names(response) -> set[str]:
    return {person["name"] for person in response.json()["items"]}


@pytest.mark.parametrize("who", ["ela", "deniz", "kaan"])  # owner, editor, viewer
def test_a_deleted_person_is_gone_for_everyone_at_once(api, world, oskar_deleted, who):
    client = api.login(getattr(world, who))

    assert "Oskar" not in names(client.get("/people"))
    assert "Oskar" not in names(client.get("/people", search="osk"))
    assert client.get(f"/people/{world.oskar.pk}").status_code == 404
    assert client.get(f"/people/{world.oskar.pk}/note").status_code == 404
    assert client.get("/relationships", person=str(world.ines.pk)).json()["items"] == []


def test_space_counts_leave_them_out(api, world, oskar_deleted):
    space = api.login(world.ela).get(f"/spaces/{world.climbing.pk}").json()

    assert space["people_count"] == 1  # Ines


def test_undo_brings_them_back_with_everything(api, world, oskar_deleted):
    client = api.login(world.ela)

    response = client.post(f"/people/{world.oskar.pk}/restore")

    assert response.status_code == 200
    assert response.json()["name"] == "Oskar"
    assert client.get(f"/people/{world.oskar.pk}/note").json()["body"].startswith("Ela:")
    assert "Oskar" in names(api.login(world.deniz).get("/people"))


def test_undo_is_too_late_after_the_window(api, world, oskar_deleted):
    Person.objects.filter(pk=world.oskar.pk).update(deleted_at=timezone.now() - LATER)

    response = api.login(world.ela).post(f"/people/{world.oskar.pk}/restore")

    assert response.status_code == 409


@pytest.mark.parametrize("who", ["deniz", "sofia"])
def test_only_the_owner_can_undo(api, world, oskar_deleted, who):
    response = api.login(getattr(world, who)).post(f"/people/{world.oskar.pk}/restore")

    assert response.status_code == 404


def test_someone_not_deleted_has_nothing_to_undo(api, world):
    assert api.login(world.ela).post(f"/people/{world.emma.pk}/restore").status_code == 404


def test_the_purge_deletes_them_and_their_data_once_undo_runs_out(world, oskar_deleted):
    assert services.purge_deleted_people() == 0  # still within the window

    assert services.purge_deleted_people(now=timezone.now() + LATER) == 1

    assert not Person.objects.filter(pk=world.oskar.pk).exists()
    assert not Note.objects.filter(person=world.oskar).exists()  # Ela's and Deniz's
    assert not Interaction.objects.filter(person=world.oskar).exists()
    assert not Relationship.objects.filter(pk=world.oskar_ines.pk).exists()
    assert Person.objects.filter(pk=world.ines.pk).exists()


def test_the_purge_job_is_safe_to_run_twice(world, oskar_deleted):
    Person.objects.filter(pk=world.oskar.pk).update(deleted_at=timezone.now() - LATER)

    assert tasks.purge_deleted_people.call() == 1
    assert tasks.purge_deleted_people.call() == 0
