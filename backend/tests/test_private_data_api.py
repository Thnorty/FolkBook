"""Notes, memory aids, timeline and keep-in-touch: always private to their author.

Uses the shared `world`: Ela, Deniz (editor) and Kaan (viewer) all see Oskar.
Ela has a note, a memory aid, an interaction and a reminder on Oskar; Deniz has
a note on Oskar.
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from interactions.models import Interaction
from people.models import MemoryAid
from tests.factories import InteractionFactory, MemoryAidFactory

pytestmark = pytest.mark.django_db


def items(response) -> list[dict]:
    assert response.status_code == 200, response.content
    return response.json()["items"]


# ---------------------------------------------------------------- notes


def note_of(world, author) -> str:
    return world.oskar.notes.get(author=author).body


@pytest.mark.parametrize(
    ("who", "expected"),
    [
        ("ela", "Ela: Oskar sets the Tuesday routes."),
        ("deniz", "Deniz: owes me a belay."),
        ("kaan", ""),
    ],
)
def test_each_user_sees_only_their_own_note(api, world, who, expected):
    response = api.login(getattr(world, who)).get(f"/people/{world.oskar.pk}/note")

    assert response.json()["body"] == expected


def test_writing_a_note_never_touches_anyone_elses(api, world):
    api.login(world.kaan).put(f"/people/{world.oskar.pk}/note", {"body": "Kaan's note"})

    elas = api.login(world.ela).get(f"/people/{world.oskar.pk}/note").json()

    assert elas["body"] == note_of(world, world.ela)
    assert note_of(world, world.kaan) == "Kaan's note"
    assert world.oskar.notes.count() == 3


def test_an_empty_note_is_removed(api, world):
    response = api.login(world.ela).put(f"/people/{world.oskar.pk}/note", {"body": "  "})

    assert response.json() == {"body": "", "updated_at": None}
    assert not world.oskar.notes.filter(author=world.ela).exists()


@pytest.mark.parametrize(("who", "target"), [("sofia", "oskar"), ("ela", "jin")])
def test_notes_on_people_you_cannot_see_are_not_found(api, world, who, target):
    client = api.login(getattr(world, who))
    path = f"/people/{getattr(world, target).pk}/note"

    assert client.get(path).status_code == 404
    assert client.put(path, {"body": "x"}).status_code == 404


def test_losing_access_hides_your_note_too(api, world):
    world.climbing.memberships.filter(user=world.deniz).delete()

    response = api.login(world.deniz).get(f"/people/{world.oskar.pk}/note")

    assert response.status_code == 404


# ---------------------------------------------------------------- memory aids


@pytest.mark.parametrize(("who", "count"), [("ela", 1), ("deniz", 0), ("kaan", 0), ("sofia", 0)])
def test_memory_aids_are_only_the_users_own(api, world, who, count):
    assert len(items(api.login(getattr(world, who)).get("/memory-aids"))) == count


def test_add_memory_aids_pinned_first(api, world):
    client = api.login(world.kaan)
    client.post("/memory-aids", {"person_id": str(world.oskar.pk), "text": "Route setter"})
    client.post(
        "/memory-aids", {"person_id": str(world.oskar.pk), "text": "Knees!", "pinned": True}
    )

    aids = items(client.get("/memory-aids", person=str(world.oskar.pk)))

    assert [a["text"] for a in aids] == ["Knees!", "Route setter"]
    assert len(items(api.login(world.ela).get("/memory-aids"))) == 1  # Ela's is untouched


def test_other_users_memory_aids_cannot_be_changed(api, world):
    elas_aid = MemoryAid.objects.get(author=world.ela)
    client = api.login(world.deniz)

    assert client.patch(f"/memory-aids/{elas_aid.pk}", {"text": "x"}).status_code == 404
    assert client.delete(f"/memory-aids/{elas_aid.pk}").status_code == 404
    elas_aid.refresh_from_db()
    assert elas_aid.text != "x"


def test_edit_and_delete_your_own_memory_aid(api, world):
    aid = MemoryAid.objects.get(author=world.ela)
    client = api.login(world.ela)

    edited = client.patch(f"/memory-aids/{aid.pk}", {"pinned": True}).json()

    assert edited["pinned"] and edited["text"] == aid.text
    assert client.delete(f"/memory-aids/{aid.pk}").status_code == 204


@pytest.mark.parametrize("text", ["", "x" * 301])
def test_memory_aid_text_must_fit_on_a_sticky_note(api, world, text):
    response = api.login(world.ela).post(
        "/memory-aids", {"person_id": str(world.oskar.pk), "text": text}
    )

    assert response.status_code == 422


def test_no_memory_aids_about_people_you_cannot_see(api, world):
    response = api.login(world.ela).post(
        "/memory-aids", {"person_id": str(world.jin.pk), "text": "x"}
    )

    assert response.status_code == 404


# ---------------------------------------------------------------- timeline


def test_the_timeline_is_the_users_own_newest_first(api, world):
    InteractionFactory(author=world.ela, person=world.oskar, occurred_on="2026-09-20")

    timeline = items(api.login(world.ela).get("/interactions", person=str(world.oskar.pk)))

    assert [i["occurred_on"] for i in timeline] == ["2026-09-20", "2026-09-12"]
    assert items(api.login(world.kaan).get("/interactions")) == []


def test_log_an_interaction(api, world):
    response = api.login(world.kaan).post(
        "/interactions",
        {
            "person_id": str(world.oskar.pk),
            "kind": "call",
            "occurred_on": "2026-09-22",
            "note": "Talked about the Frankenjura trip",
        },
    )

    assert response.status_code == 201
    assert Interaction.objects.filter(author=world.kaan).count() == 1


def test_custom_interactions_need_a_label(api, world):
    response = api.login(world.ela).post(
        "/interactions",
        {"person_id": str(world.oskar.pk), "kind": "custom", "occurred_on": "2026-09-22"},
    )

    assert response.status_code == 422


def test_other_users_timeline_entries_cannot_be_changed(api, world):
    elas = Interaction.objects.get(author=world.ela)
    client = api.login(world.deniz)

    assert client.patch(f"/interactions/{elas.pk}", {"note": "x"}).status_code == 404
    assert client.delete(f"/interactions/{elas.pk}").status_code == 404


def test_edit_a_timeline_entry(api, world):
    entry = Interaction.objects.get(author=world.ela)

    body = api.login(world.ela).patch(f"/interactions/{entry.pk}", {"note": "Coffee"}).json()

    assert body["note"] == "Coffee"


def test_timeline_query_count_does_not_grow(api, world):
    client = api.login(world.ela)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            client.get("/interactions")
        return len(captured)

    before = queries()
    for _ in range(10):
        InteractionFactory(author=world.ela, person=world.oskar)
        MemoryAidFactory(author=world.ela, person=world.oskar)

    assert queries() == before


# ---------------------------------------------------------------- keep in touch


def test_keep_in_touch_defaults_when_not_set(api, world):
    body = api.login(world.kaan).get(f"/keep-in-touch/{world.oskar.pk}").json()

    assert body == {"interval_days": None, "snoozed_until": None, "stopped": False}


def test_each_user_has_their_own_keep_in_touch_setting(api, world):
    api.login(world.kaan).put(
        f"/keep-in-touch/{world.oskar.pk}", {"interval_days": 42, "stopped": False}
    )

    kaans = api.login(world.kaan).get(f"/keep-in-touch/{world.oskar.pk}").json()
    elas = api.login(world.ela).get(f"/keep-in-touch/{world.oskar.pk}").json()

    assert kaans["interval_days"] == 42
    assert elas["interval_days"] is None


@pytest.mark.parametrize("interval", [0, -5])
def test_keep_in_touch_interval_is_at_least_a_day(api, world, interval):
    response = api.login(world.ela).put(
        f"/keep-in-touch/{world.oskar.pk}", {"interval_days": interval}
    )

    assert response.status_code == 422


def test_no_reminders_about_people_you_cannot_see(api, world):
    assert api.login(world.sofia).get(f"/keep-in-touch/{world.oskar.pk}").status_code == 404
