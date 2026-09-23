"""Graph endpoints. Uses the shared `world` and `api` client."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from tests.factories import PersonFactory, RelationshipFactory

pytestmark = pytest.mark.django_db


def test_the_graph_of_a_viewer(api, world):
    body = api.login(world.kaan).get("/graph").json()

    nodes = {node["name"]: node for node in body["nodes"]}
    assert set(nodes) == {"Kaan", "Oskar", "Ines", "Ela", "Deniz"}
    assert nodes["Kaan"]["is_me"] and not nodes["Ela"]["is_me"]
    assert [s["name"] for s in nodes["Oskar"]["spaces"]] == ["Climbing club"]
    assert {edge["kind"] for edge in body["edges"]} == {"relationship", "space", "member"}
    assert len(body["edges"]) == 5


def test_edges_describe_themselves(api, world):
    edges = api.login(world.ela).get("/graph").json()["edges"]

    friend = next(e for e in edges if e["id"] == f"relationship:{world.oskar_ines.pk}")
    in_space = next(e for e in edges if e["kind"] == "space")
    assert (friend["type"], friend["former"], friend["space"]["name"]) == (
        "friend",
        False,
        "Climbing club",
    )
    assert in_space["type"] is None and in_space["space"]


def test_the_graph_needs_a_login(api):
    assert api.get("/graph").status_code == 401


def test_graph_query_count_does_not_grow_with_the_book(api, world):
    client = api.login(world.ela)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            client.get("/graph")
        return len(captured)

    before = queries()
    for _ in range(15):
        person = PersonFactory(owner=world.ela)
        world.climbing.people.add(person)
        RelationshipFactory(owner=world.ela, person_a=person, person_b=world.oskar)

    assert queries() == before


@pytest.mark.parametrize(("hops", "expected"), [(1, 4), (2, 7)])
def test_neighborhood(api, world, hops, expected):
    response = api.login(world.ela).get(f"/graph/neighborhood/{world.oskar.pk}", hops=hops)

    assert len(response.json()["nodes"]) == expected


@pytest.mark.parametrize("hops", [0, 3])
def test_neighborhood_is_one_or_two_hops(api, world, hops):
    response = api.login(world.ela).get(f"/graph/neighborhood/{world.oskar.pk}", hops=hops)

    assert response.status_code == 422


def test_how_do_i_know_tom(api, world):
    (path,) = api.login(world.ela).get(f"/graph/paths/{world.tom.pk}").json()["paths"]

    assert [(h["source"]["name"], h["target"]["name"], h["kind"]) for h in path["hops"]] == [
        ("Ela", "Defne", "member"),
        ("Defne", "Tom", "space"),
    ]
    assert path["hops"][1]["space"]["name"] == "Hackathon 2026"


def test_no_paths_to_yourself(api, world):
    response = api.login(world.ela).get(f"/graph/paths/{world.ela.me.pk}")

    assert response.json() == {"paths": []}


@pytest.mark.parametrize("path", ["/graph/paths/{}", "/graph/neighborhood/{}"])
def test_people_you_cannot_see_are_not_found(api, world, path):
    assert api.login(world.ela).get(path.format(world.jin.pk)).status_code == 404
