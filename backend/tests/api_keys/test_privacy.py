"""What each API key can see and change, through real requests (AGENTS.md: privacy tests
with scoped keys). The policy layer decides; these pin what that means for keys."""

import pytest

from access.policy import Access
from api_keys import services
from api_keys.schemas import ApiKeyIn
from people.models import AccessEnded
from spaces import services as space_services
from tests.imports.test_import import GRETA, vcf


@pytest.fixture
def keys(api, world):
    """Ela's keys, each as a client."""

    def client(**data):
        _, key = services.create_api_key(Access.for_user(world.ela), ApiKeyIn(name="K", **data))
        return api.with_key(key)

    return {
        "read-only": client(),
        "climbing": client(read_only=False, include_private=True, space_ids=[world.climbing.pk]),
        "private": client(include_private=True),
        "everything": client(read_only=False, include_private=True),
    }


def names(items) -> set[str]:
    return {item["name"] for item in items}


def test_people_and_search(keys, world):
    everyone = names(keys["read-only"].get("/people").json()["items"])
    climbing = names(keys["climbing"].get("/people").json()["items"])

    assert {"Emma", "Oskar", "Ines", "Tom", "Ola"} <= everyone
    assert "Jin" not in everyone  # Defne's, in no space
    assert climbing == {"Ela", "Oskar", "Ines", "Deniz", "Kaan"}
    assert keys["climbing"].get(f"/people/{world.emma.pk}").status_code == 404
    assert names(keys["read-only"].get("/search", q="Emma").json()["people"]) == {"Emma"}
    assert keys["climbing"].get("/search", q="Emma").json()["people"] == []


def test_graph_and_links(keys, world):
    links = keys["climbing"].get("/relationships").json()["items"]
    nodes = {node["id"] for node in keys["climbing"].get("/graph").json()["nodes"]}

    assert [link["id"] for link in links] == [str(world.oskar_ines.pk)]
    assert str(world.emma.pk) not in nodes and str(world.tom.pk) not in nodes
    private = f"/relationships/{world.emma_oskar_private.pk}"
    assert keys["climbing"].get(private).status_code == 404
    assert keys["read-only"].get(private).status_code == 200


def test_private_data(keys, world):
    read_only, private = keys["read-only"], keys["private"]
    note = f"/people/{world.oskar.pk}/note"

    assert read_only.get("/memory-aids").json()["count"] == 0
    assert read_only.get("/interactions").json()["count"] == 0
    assert read_only.get(note).json()["body"] == ""
    assert private.get(note).json()["body"] == "Ela: Oskar sets the Tuesday routes."
    assert private.get("/memory-aids").json()["count"] == 1
    assert keys["climbing"].get(note).json()["body"] == "Ela: Oskar sets the Tuesday routes."
    assert len(private.get("/search", q="Tuesday").json()["notes"]) == 1
    assert read_only.get("/search", q="Tuesday").json()["notes"] == []
    assert private.get("/search", q="belay").json()["notes"] == []  # Deniz's own note


def test_today(keys, world):
    for person, day in ((world.emma, 10), (world.oskar, 11)):
        person.birth_day, person.birth_month = day, 3
        person.save()
    AccessEnded.objects.create(
        user=world.ela, reason="stopped_sharing", by="Defne", space="Hackathon 2026", lost_count=2
    )
    week = {"today": "2026-03-09", "days": 7}

    def birthdays(key):
        return {b["person"]["name"] for b in keys[key].get("/today/birthdays", **week).json()}

    assert birthdays("read-only") == {"Emma", "Oskar"}
    assert birthdays("climbing") == {"Oskar"}
    assert keys["read-only"].get("/today/access-ended").json() == []
    assert len(keys["private"].get("/today/access-ended").json()) == 1


def test_exports(keys, world):
    assert keys["read-only"].get("/export/everything").status_code == 403
    assert keys["climbing"].get("/export/everything").status_code == 403
    assert keys["private"].get("/export/everything").status_code == 200
    assert keys["climbing"].get(f"/export/people/{world.emma.pk}").status_code == 404


def test_imports(keys, world):
    assert keys["climbing"].get("/imports").json() == {"items": [], "count": 0}
    upload = keys["read-only"].upload("/imports/preview", {"file": vcf(GRETA)})
    assert upload.status_code == 403


def test_writes(keys, world):
    oskar, emma = f"/people/{world.oskar.pk}", f"/people/{world.emma.pk}"
    climbing = keys["climbing"]

    assert keys["read-only"].patch(oskar, {"work": "Route setter"}).status_code == 403
    assert climbing.patch(oskar, {"work": "Route setter"}).status_code == 200
    link = {"person_a_id": str(world.oskar.pk), "person_b_id": str(world.emma.pk)}
    assert climbing.post("/relationships", {**link, "type": "friend"}).status_code == 404
    assert climbing.delete(emma).status_code == 404
    assert keys["everything"].post("/spaces", {"name": "Book club"}).status_code == 201
    assert climbing.post("/spaces", {"name": "Board games"}).status_code == 403


def test_leaving_a_space_takes_it_from_the_key(api, world):
    _, key = services.create_api_key(
        Access.for_user(world.deniz), ApiKeyIn(name="K", space_ids=[world.climbing.pk])
    )
    client = api.with_key(key)
    assert "Oskar" in names(client.get("/people").json()["items"])

    space_services.leave(Access.for_user(world.deniz), world.climbing)

    assert names(client.get("/people").json()["items"]) == {"Deniz"}
