"""The family tree endpoint, and who sees what in it. Uses the shared `world` and `api`."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from access.policy import Access
from relationships.models import ParentType, RelationshipType
from relationships.tree import family_tree
from tests.factories import PersonFactory, RelationshipFactory

pytestmark = pytest.mark.django_db


def parent(owner, of, *, space=None, kind=ParentType.BIOLOGICAL, person=None, name=None):
    """A parent link `person` → `of` (a new person called `name` if none given)."""
    person = person or PersonFactory(owner=owner, name=name)
    RelationshipFactory(
        owner=owner,
        person_a=person,
        person_b=of,
        type=RelationshipType.PARENT,
        parent_type=kind,
        space=space,
    )
    return person


def partner(owner, a, b, *, former=False):
    RelationshipFactory(
        owner=owner, person_a=a, person_b=b, type=RelationshipType.PARTNER, is_former=former
    )


def by_name(body: dict) -> dict:
    return {person["name"]: person for person in body["people"]}


def test_a_small_family(api, world):
    mum = parent(world.ela, world.emma, name="Ayşe")
    mum.pronouns = "she"
    mum.save()
    dad = parent(world.ela, world.emma, name="Murat", kind=ParentType.ADOPTIVE)
    partner(world.ela, world.emma, world.ela.me)

    body = api.login(world.ela).get(f"/graph/family-tree/{world.emma.pk}").json()

    people = by_name(body)
    assert body["root"] == str(world.emma.pk)
    assert set(people) == {"Emma", "Ayşe", "Murat", "Ela"}
    assert people["Emma"]["relation"] == [] and people["Emma"]["generation"] == 0
    assert people["Ayşe"]["generation"] == 1 and people["Ayşe"]["pronouns"] == "she"
    assert people["Ayşe"]["relation"] == [
        {"relation": "parent", "pronouns": "she", "parent_type": "biological", "former": False}
    ]
    assert people["Ela"]["is_me"] and not people["Emma"]["is_me"]
    assert people["Ela"]["relation"][0]["relation"] == "partner"
    assert people["Emma"]["missing_parents"] == 0
    assert people["Ayşe"]["missing_parents"] == 2
    assert people["Ela"]["missing_parents"] == 0  # a partner, not an ancestor
    assert not people["Ela"]["in_law"] and not people["Ela"]["via_former"]
    assert people["Murat"]["photo_url"] is None
    links = {(link["source"], link["target"]): link for link in body["links"]}
    adoptive = links[(str(dad.pk), str(world.emma.pk))]
    assert (adoptive["type"], adoptive["parent_type"], adoptive["former"]) == (
        "parent",
        "adoptive",
        False,
    )
    assert len(body["links"]) == 3
    together = links[tuple(sorted([str(world.emma.pk), str(world.ela.me.pk)]))]
    assert together["parent_type"] is None  # like the profile's family: no type but for parents
    assert people["Ela"]["relation"][0]["parent_type"] is None


def test_someone_with_no_family_is_a_tree_of_one(api, world):
    body = api.login(world.ela).get(f"/graph/family-tree/{world.emma.pk}").json()

    assert [p["name"] for p in body["people"]] == ["Emma"]
    assert body["people"][0]["missing_parents"] == 2
    assert body["links"] == []


def test_people_you_cannot_see_are_not_found(api, world):
    assert api.login(world.ela).get(f"/graph/family-tree/{world.jin.pk}").status_code == 404


def test_a_malformed_id_is_not_found(api, world):
    assert api.login(world.ela).get("/graph/family-tree/abc").status_code == 404


def test_the_tree_needs_a_login(api, world):
    assert api.get(f"/graph/family-tree/{world.emma.pk}").status_code == 401


def test_the_tree_query_count_does_not_grow(api, world):
    client = api.login(world.ela)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            client.get(f"/graph/family-tree/{world.emma.pk}")
        return len(captured)

    parent(world.ela, world.emma, name="Mum")
    before = queries()
    for _ in range(15):
        child = PersonFactory(owner=world.ela)
        parent(world.ela, child, person=world.emma)

    assert queries() == before


# ------------------------------------------------------------------ who sees what


def names(tree) -> set[str]:
    return {person.name for person, _ in tree.people}


def test_other_users_private_family_never_shows(api, world):
    parent(world.defne, world.tom, person=world.jin)  # Defne's private link

    people = by_name(api.login(world.ela).get(f"/graph/family-tree/{world.tom.pk}").json())

    assert set(people) == {"Tom"}


def test_a_link_outside_your_spaces_does_not_join_families(world):
    parent(world.ela, world.oskar, person=world.emma)  # private: Kaan can't see it

    assert names(family_tree(Access.for_user(world.kaan), world.oskar)) == {"Oskar"}


@pytest.mark.parametrize("who", ["kaan", "deniz"])  # viewer, editor
def test_space_members_see_the_spaces_family_links(world, who):
    parent(world.ela, world.oskar, person=world.ines, space=world.climbing)

    tree = family_tree(Access.for_user(getattr(world, who)), world.oskar)

    assert names(tree) == {"Oskar", "Ines"}
    missing = {person.name: placed.missing_parents for person, placed in tree.people}
    assert missing == {"Oskar": 1, "Ines": 2}


def test_a_read_only_key_gets_no_slots(world):
    parent(world.ela, world.oskar, person=world.emma)

    tree = family_tree(Access.limited(world.ela, read_only=True), world.oskar)

    assert names(tree) == {"Oskar", "Emma"}
    assert all(placed.missing_parents == 0 for _, placed in tree.people)


def test_a_space_limited_key_sees_only_its_spaces(world):
    parent(world.ela, world.oskar, person=world.emma)  # private
    parent(world.ela, world.oskar, person=world.ines, space=world.climbing)

    key = Access.limited(world.ela, space_ids=[world.climbing.pk], read_only=False)
    tree = family_tree(key, world.oskar)

    assert names(tree) == {"Oskar", "Ines"}
    assert all(placed.missing_parents == 0 for _, placed in tree.people)
