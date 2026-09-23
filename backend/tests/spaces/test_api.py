"""Space endpoints. Uses the shared `world` (tests/worlds.py) and `api` client."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from people.models import Person
from spaces.models import Space
from tests.factories import SpaceFactory, SpaceMembershipFactory

pytestmark = pytest.mark.django_db


def test_list_spaces_with_the_viewers_role(api, world):
    response = api.login(world.ela).get("/spaces")

    assert response.status_code == 200
    spaces = {s["name"]: s for s in response.json()["items"]}
    assert set(spaces) == {"Climbing club", "Hackathon 2026"}
    climbing, hackathon = spaces["Climbing club"], spaces["Hackathon 2026"]
    assert (climbing["role"], climbing["people_count"], climbing["member_count"]) == (
        "owner",
        2,
        2,
    )
    assert (hackathon["role"], hackathon["owner"]["name"]) == ("viewer", "Defne")


def test_an_outsider_sees_no_spaces(api, world):
    assert api.login(world.sofia).get("/spaces").json()["items"] == []


def test_listing_spaces_takes_the_same_number_of_queries_for_more_spaces(api, world):
    client = api.login(world.ela)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            client.get("/spaces")
        return len(captured)

    before = queries()
    for _ in range(10):
        SpaceMembershipFactory(space=SpaceFactory(owner=world.ela), user=world.kaan)

    assert queries() == before


def test_create_a_private_space(api, world):
    response = api.login(world.kaan).post(
        "/spaces", {"name": "Work", "color": "slate", "description": "Loop"}
    )

    assert response.status_code == 201
    body = response.json()
    assert (body["role"], body["member_count"], body["share_contact_details"]) == (
        "owner",
        0,
        False,
    )


def test_space_names_must_be_unique_for_you_ignoring_case(api, world):
    response = api.login(world.ela).post("/spaces", {"name": "climbing CLUB"})

    assert response.status_code == 409
    assert "already" in response.json()["detail"]


def test_others_can_reuse_a_space_name(api, world):
    assert api.login(world.kaan).post("/spaces", {"name": "Climbing club"}).status_code == 201


def test_unknown_colors_are_rejected(api, world):
    assert api.login(world.ela).post("/spaces", {"name": "X", "color": "neon"}).status_code == 422


@pytest.mark.parametrize(("who", "status"), [("ela", 200), ("deniz", 403), ("sofia", 404)])
def test_only_the_owner_changes_a_space(api, world, who, status):
    response = api.login(getattr(world, who)).patch(
        f"/spaces/{world.climbing.pk}", {"share_contact_details": True}
    )

    assert response.status_code == status
    world.climbing.refresh_from_db()
    assert world.climbing.share_contact_details == (status == 200)


def test_renaming_to_a_taken_name_conflicts(api, world):
    SpaceFactory(owner=world.ela, name="Work")

    response = api.login(world.ela).patch(f"/spaces/{world.climbing.pk}", {"name": "work"})

    assert response.status_code == 409


def test_deleting_a_space_keeps_its_people(api, world):
    response = api.login(world.ela).delete(f"/spaces/{world.climbing.pk}")

    assert response.status_code == 204
    assert not Space.objects.filter(pk=world.climbing.pk).exists()
    assert Person.objects.filter(pk=world.oskar.pk).exists()


def test_members_cannot_delete_a_space(api, world):
    assert api.login(world.deniz).delete(f"/spaces/{world.climbing.pk}").status_code == 403


@pytest.mark.parametrize(
    ("who", "target", "space", "status"),
    [
        ("deniz", "yuki", "climbing", 204),  # editor adds his own person
        ("ela", "emma", "climbing", 204),
        ("ela", "tom", "climbing", 403),  # Defne doesn't take part in Climbing club
        ("kaan", "oskar", "climbing", 403),  # viewer
        ("ela", "jin", "climbing", 404),  # can't see Jin
        ("deniz", "yuki", "hackathon", 404),  # can't see the space
    ],
)
def test_add_a_person_to_a_space(api, world, who, target, space, status):
    response = api.login(getattr(world, who)).post(
        f"/spaces/{getattr(world, space).pk}/people", {"person_id": str(getattr(world, target).pk)}
    )

    assert response.status_code == status


def test_a_person_added_by_an_editor_shows_up_for_the_owner(api, world):
    api.login(world.deniz).post(
        f"/spaces/{world.climbing.pk}/people", {"person_id": str(world.yuki.pk)}
    )

    response = api.login(world.ela).get("/people", space=str(world.climbing.pk))

    assert [p["name"] for p in response.json()["items"]] == ["Ines", "Oskar", "Yuki"]


def test_adding_someone_twice_is_harmless(api, world):
    client = api.login(world.ela)
    path = f"/spaces/{world.climbing.pk}/people"

    assert client.post(path, {"person_id": str(world.oskar.pk)}).status_code == 204
    assert world.climbing.people.filter(pk=world.oskar.pk).count() == 1


@pytest.mark.parametrize(("who", "status"), [("deniz", 204), ("kaan", 403)])
def test_remove_a_person_from_a_space(api, world, who, status):
    response = api.login(getattr(world, who)).delete(
        f"/spaces/{world.climbing.pk}/people/{world.ines.pk}"
    )

    assert response.status_code == status
    assert world.climbing.people.filter(pk=world.ines.pk).exists() == (status != 204)
    assert Person.objects.filter(pk=world.ines.pk).exists()
