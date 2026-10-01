"""Sharing a space: its members, finding accounts to share with, roles.

In the shared `world`: Climbing club is Ela's, with Deniz as editor and Kaan as viewer;
Hackathon 2026 is Defne's, with Ela as viewer. Sofia is in no space.
"""

import pytest

from accounts.models import User
from spaces.models import SpaceMembership

pytestmark = pytest.mark.django_db


def members(api, user, space) -> list[tuple[str, str, bool]]:
    response = api.login(user).get(f"/spaces/{space.pk}/members")
    assert response.status_code == 200, response.content
    return [(m["name"], m["role"], m["is_you"]) for m in response.json()]


def test_everyone_in_a_space_sees_who_else_is(api, world):
    assert members(api, world.kaan, world.climbing) == [
        ("Ela", "owner", False),
        ("Deniz", "editor", False),
        ("Kaan", "viewer", True),
    ]


def test_people_outside_a_space_see_nothing_of_it(api, world):
    assert api.login(world.sofia).get(f"/spaces/{world.climbing.pk}/members").status_code == 404


def test_the_owner_finds_accounts_to_share_with(api, world):
    found = api.login(world.ela).get(f"/spaces/{world.climbing.pk}/share-candidates", q="so")

    assert [account["name"] for account in found.json()] == ["Sofia"]
    already = api.login(world.ela).get(f"/spaces/{world.climbing.pk}/share-candidates", q="deniz")
    assert already.json() == []  # in the space already


@pytest.mark.parametrize(("who", "status"), [("deniz", 403), ("sofia", 404)])
def test_only_the_owner_looks_for_accounts(api, world, who, status):
    response = api.login(getattr(world, who)).get(
        f"/spaces/{world.climbing.pk}/share-candidates", q="so"
    )

    assert response.status_code == status


def test_a_search_needs_two_letters(api, world):
    response = api.login(world.ela).get(f"/spaces/{world.climbing.pk}/share-candidates", q="s")

    assert response.status_code == 422


def test_sharing_lets_the_new_member_see_the_spaces_people(api, world):
    client = api.login(world.ela)

    response = client.post(
        f"/spaces/{world.climbing.pk}/members", {"user_id": str(world.sofia.pk), "role": "editor"}
    )

    assert response.status_code == 201
    assert response.json()["role"] == "editor"
    names = {p["name"] for p in api.login(world.sofia).get("/people").json()["items"]}
    assert {"Oskar", "Ines"} <= names


def test_sharing_twice_or_with_a_deactivated_account_is_refused(api, world):
    client = api.login(world.ela)
    User.objects.filter(pk=world.sofia.pk).update(is_active=False)

    again = client.post(f"/spaces/{world.climbing.pk}/members", {"user_id": str(world.kaan.pk)})
    inactive = client.post(f"/spaces/{world.climbing.pk}/members", {"user_id": str(world.sofia.pk)})

    assert again.status_code == inactive.status_code == 409


def test_only_the_owner_shares(api, world):
    response = api.login(world.deniz).post(
        f"/spaces/{world.climbing.pk}/members", {"user_id": str(world.sofia.pk)}
    )

    assert response.status_code == 403


def test_the_owner_changes_roles(api, world):
    response = api.login(world.ela).patch(
        f"/spaces/{world.climbing.pk}/members/{world.kaan.pk}", {"role": "editor"}
    )

    assert response.json()["role"] == "editor"
    assert SpaceMembership.objects.get(space=world.climbing, user=world.kaan).role == "editor"


@pytest.mark.parametrize(
    ("who", "target", "status"), [("deniz", "kaan", 403), ("ela", "sofia", 404)]
)
def test_role_changes_need_the_owner_and_a_member(api, world, who, target, status):
    response = api.login(getattr(world, who)).patch(
        f"/spaces/{world.climbing.pk}/members/{getattr(world, target).pk}", {"role": "editor"}
    )

    assert response.status_code == status
