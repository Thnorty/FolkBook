"""Undo all of this: right after saving, by whoever saved it, once."""

import datetime

import pytest
from django.utils import timezone

from access.policy import Access, visible_people
from capture import tasks
from capture.models import Capture
from interactions.models import Interaction
from people.models import MemoryAid, Person
from relationships.models import Relationship

pytestmark = pytest.mark.django_db


@pytest.fixture
def saved(api, world, tom_and_emma) -> dict:
    return api.login(world.ela).post("/capture/save", tom_and_emma).json()


def test_undo_removes_and_restores(api, world, saved):
    response = api.login(world.ela).post(f"/capture/{saved['capture_id']}/undo")

    assert response.status_code == 200
    assert response.json() == {
        "removed": {"people": 1, "connections": 1, "memory_aids": 1, "entries": 1},
        "restored": 1,
    }
    names = set(visible_people(Access.for_user(world.ela)).values_list("name", flat=True))
    assert "Tom Berg" not in names
    tom = Person.objects.get(name="Tom Berg")  # gone for good once Undo runs out, as usual
    assert tom.deleted_at is not None
    assert not Relationship.objects.filter(person_a=tom).exists()
    assert not Relationship.objects.filter(person_b=tom).exists()
    assert not MemoryAid.objects.filter(person=tom).exists()
    assert not Interaction.objects.filter(person=world.emma, label="Coffee").exists()
    world.emma.refresh_from_db()
    assert world.emma.work == "Google"


def test_undo_keeps_newer_values(api, world, saved):
    client = api.login(world.ela)
    client.patch(f"/people/{world.emma.pk}", {"work": "Figma"})

    restored = client.post(f"/capture/{saved['capture_id']}/undo").json()["restored"]

    world.emma.refresh_from_db()
    assert (world.emma.work, restored) == ("Figma", 0)


def test_undo_puts_tags_back(api, world):
    world.emma.tags.create(owner=world.ela, name="family")
    body = {
        "existing_people": [
            {"ref": "e", "person_id": str(world.emma.pk), "changes": {"add_tags": ["climbing"]}}
        ]
    }
    client = api.login(world.ela)
    saved = client.post("/capture/save", body).json()

    client.post(f"/capture/{saved['capture_id']}/undo")

    assert list(world.emma.tags.values_list("name", flat=True)) == ["family"]


def test_undo_only_once_and_only_yours(api, world, saved):
    assert api.login(world.deniz).post(f"/capture/{saved['capture_id']}/undo").status_code == 404

    client = api.login(world.ela)
    assert client.post(f"/capture/{saved['capture_id']}/undo").status_code == 200
    again = client.post(f"/capture/{saved['capture_id']}/undo")
    assert again.status_code == 409
    assert again.json() == {"detail": "This was already undone."}


def test_old_captures_are_forgotten(world):
    old = Capture.objects.create(owner=world.ela)
    Capture.objects.filter(pk=old.pk).update(created_at=timezone.now() - datetime.timedelta(days=2))
    recent = Capture.objects.create(owner=world.ela)

    assert tasks.forget_old_captures.call() == 1
    assert list(Capture.objects.all()) == [recent]
