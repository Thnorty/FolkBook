"""Relationship and family endpoints. Uses the shared `world` and `api` client."""

import pytest

from relationships.models import Relationship
from tests.factories import RelationshipFactory

pytestmark = pytest.mark.django_db


def ids(response) -> set[str]:
    return {link["id"] for link in response.json()["items"]}


def link_ids(world, *names) -> set[str]:
    return {str(getattr(world, name).pk) for name in names}


def create(client, a, b, **fields):
    return client.post(
        "/relationships",
        {"person_a_id": str(a.pk), "person_b_id": str(b.pk), "type": "friend", **fields},
    )


# ---------------------------------------------------------------- reading


def test_list_shows_the_links_the_user_can_see(api, world):
    response = api.login(world.ela).get("/relationships")

    assert ids(response) == link_ids(
        world, "emma_oskar_private", "oskar_ines", "oskar_emma_in_climbing", "tom_ola"
    )


def test_list_for_one_person(api, world):
    response = api.login(world.kaan).get("/relationships", person=str(world.oskar.pk))

    assert ids(response) == link_ids(world, "oskar_ines")


def test_list_family_or_social_links_only(api, world):
    RelationshipFactory(owner=world.ela, person_a=world.emma, person_b=world.oskar, type="sibling")
    client = api.login(world.ela)

    family = client.get("/relationships", family=True).json()["items"]
    social = client.get("/relationships", family=False).json()["items"]

    assert [link["type"] for link in family] == ["sibling"]
    assert "sibling" not in {link["type"] for link in social}


def test_someone_elses_private_link_is_not_found(api, world):
    response = api.login(world.ela).get(f"/relationships/{world.tom_jin_private.pk}")

    assert response.status_code == 404


# ---------------------------------------------------------------- creating


def test_create_a_private_link(api, world):
    response = create(api.login(world.ela), world.ela.me, world.tom)

    assert response.status_code == 201
    body = response.json()
    assert body["is_mine"] and body["space"] is None
    assert {body["person_a"]["name"], body["person_b"]["name"]} == {"Ela", "Tom"}


def test_symmetric_links_are_stored_once_whichever_way_they_are_sent(api, world):
    client = api.login(world.ela)

    assert create(client, world.emma, world.tom).status_code == 201
    response = create(client, world.tom, world.emma)

    assert response.status_code == 409
    assert response.json()["detail"] == "This link already exists."


def test_parent_links_keep_their_direction(api, world):
    body = create(
        api.login(world.ela), world.oskar, world.emma, type="parent", parent_type="step"
    ).json()

    assert (body["person_a"]["name"], body["person_b"]["name"]) == ("Oskar", "Emma")
    assert body["parent_type"] == "step"


@pytest.mark.parametrize(
    ("fields", "message"),
    [
        ({"type": "parent"}, "Parent links need a parent type"),
        ({"type": "met_at"}, "need a label"),
        ({"type": "friend", "parent_type": "step"}, "only parent links have one"),
    ],
)
def test_invalid_links_explain_what_is_wrong(api, world, fields, message):
    response = create(api.login(world.ela), world.emma, world.tom, **fields)

    assert response.status_code == 422
    assert message in response.json()["detail"][0]["msg"]


def test_a_person_cannot_be_linked_to_themselves(api, world):
    response = create(api.login(world.ela), world.emma, world.emma)

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("who", "a", "b", "space", "status"),
    [
        ("ela", "oskar", "ines", "climbing", 201),
        ("ela", "oskar", "emma", "climbing", 403),  # Emma isn't in Climbing club
        ("kaan", "oskar", "ines", "climbing", 403),  # viewer
        ("kaan", "oskar", "ines", None, 201),  # a private link of Kaan's own
        ("ela", "oskar", "jin", None, 404),  # can't see Jin
        ("deniz", "oskar", "ines", "hackathon", 404),  # can't see the space
    ],
)
def test_who_can_link_whom_where(api, world, who, a, b, space, status):
    fields = {"type": "colleague"}
    if space:
        fields["space_id"] = str(getattr(world, space).pk)

    response = create(
        api.login(getattr(world, who)), getattr(world, a), getattr(world, b), **fields
    )

    assert response.status_code == status


# ---------------------------------------------------------------- changing


def test_end_and_reopen_a_partnership(api, world):
    client = api.login(world.ela)
    link = create(client, world.emma, world.oskar, type="partner").json()

    ended = client.post(f"/relationships/{link['id']}/end", {"ended_on": "2026-03-01"}).json()
    reopened = client.post(f"/relationships/{link['id']}/reopen").json()

    assert (ended["is_former"], ended["ended_on"]) == (True, "2026-03-01")
    assert (reopened["is_former"], reopened["ended_on"]) == (False, None)


def test_a_link_can_end_without_a_known_date(api, world):
    body = api.login(world.ela).post(f"/relationships/{world.emma_oskar_private.pk}/end", {}).json()

    assert body["is_former"] and body["ended_on"] is None


def test_parent_links_never_end(api, world):
    client = api.login(world.ela)
    link = create(client, world.oskar, world.emma, type="parent", parent_type="biological")

    response = client.post(f"/relationships/{link.json()['id']}/end", {})

    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == "Parent links never end."


def test_reopening_clashes_with_a_newer_link(api, world):
    client = api.login(world.ela)
    client.post(f"/relationships/{world.emma_oskar_private.pk}/end", {})
    create(client, world.emma, world.oskar)

    response = client.post(f"/relationships/{world.emma_oskar_private.pk}/reopen")

    assert response.status_code == 409


@pytest.mark.parametrize(("who", "status"), [("ela", 200), ("deniz", 403), ("sofia", 404)])
def test_only_the_links_owner_changes_it(api, world, who, status):
    response = api.login(getattr(world, who)).patch(
        f"/relationships/{world.oskar_ines.pk}", {"started_on": "2024-05-01"}
    )

    assert response.status_code == status


@pytest.mark.parametrize(("who", "status"), [("ela", 204), ("kaan", 403), ("sofia", 404)])
def test_only_the_links_owner_deletes_it(api, world, who, status):
    response = api.login(getattr(world, who)).delete(f"/relationships/{world.oskar_ines.pk}")

    assert response.status_code == status
    assert Relationship.objects.filter(pk=world.oskar_ines.pk).exists() == (status != 204)


# ---------------------------------------------------------------- family


@pytest.fixture
def ela_has_a_brother(api, world):
    client = api.login(world.ela)
    for child in (world.ela.me, world.emma):
        create(client, world.oskar, child, type="parent", parent_type="biological")


def test_family_of_a_person(api, world, ela_has_a_brother):
    response = api.login(world.ela).get(f"/people/{world.ela.me.pk}/family")

    assert response.status_code == 200
    family = {(r["person"]["name"], r["relation"], r["derived"]) for r in response.json()}
    assert family == {("Oskar", "parent", False), ("Emma", "sibling", True)}


def test_private_family_links_tell_others_nothing(api, world, ela_has_a_brother):
    response = api.login(world.deniz).get(f"/people/{world.ela.me.pk}/family")

    assert response.json() == []


def test_family_of_someone_you_cannot_see_is_not_found(api, world):
    assert api.login(world.ela).get(f"/people/{world.jin.pk}/family").status_code == 404
