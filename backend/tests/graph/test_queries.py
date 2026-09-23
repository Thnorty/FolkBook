"""The visible network, focus neighborhoods and "How do I know …?" paths.

Uses the shared `world` (tests/worlds.py): Ela owns Climbing club (Deniz editor,
Kaan viewer) and is a viewer in Defne's Hackathon 2026.
"""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from access.policy import Access, visible_relationships
from graph.queries import EdgeKind, neighborhood, paths_to, visible_graph
from tests.factories import PersonFactory, RelationshipFactory

pytestmark = pytest.mark.django_db

USERS = ["ela", "defne", "deniz", "kaan", "sofia"]


def access(world, who: str) -> Access:
    return Access.for_user(getattr(world, who))


def edge_summary(graph) -> set[tuple]:
    """(kind, what connects them, the two names) for every edge."""

    def what(edge):
        if edge.kind == EdgeKind.RELATIONSHIP:
            return edge.relationship.type
        return edge.space.name

    return {
        (edge.kind, what(edge), frozenset({graph.people[edge.a].name, graph.people[edge.b].name}))
        for edge in graph.edges
    }


def names_on(world, path, who="ela") -> list[str]:
    graph = visible_graph(access(world, who))
    return [graph.people[hop.target].name for hop in path]


def test_elas_graph(world):
    graph = visible_graph(access(world, "ela"))

    assert {p.name for p in graph.people.values()} == {
        "Ela", "Emma", "Oskar", "Ines", "Deniz", "Kaan", "Tom", "Ola", "Defne",
    }  # fmt: skip
    assert edge_summary(graph) == {
        ("relationship", "friend", frozenset({"Emma", "Oskar"})),
        ("relationship", "colleague", frozenset({"Oskar", "Emma"})),
        ("relationship", "friend", frozenset({"Oskar", "Ines"})),
        ("relationship", "friend", frozenset({"Tom", "Ola"})),
        ("space", "Climbing club", frozenset({"Ela", "Oskar"})),
        ("space", "Climbing club", frozenset({"Ela", "Ines"})),
        ("space", "Hackathon 2026", frozenset({"Defne", "Tom"})),
        ("space", "Hackathon 2026", frozenset({"Defne", "Ola"})),
        ("member", "Climbing club", frozenset({"Ela", "Deniz"})),
        ("member", "Climbing club", frozenset({"Ela", "Kaan"})),
        ("member", "Hackathon 2026", frozenset({"Defne", "Ela"})),
    }


def test_a_viewers_graph_shows_only_their_space(world):
    graph = visible_graph(access(world, "kaan"))

    assert {p.name for p in graph.people.values()} == {"Kaan", "Oskar", "Ines", "Ela", "Deniz"}
    assert edge_summary(graph) == {
        ("relationship", "friend", frozenset({"Oskar", "Ines"})),
        ("space", "Climbing club", frozenset({"Ela", "Oskar"})),
        ("space", "Climbing club", frozenset({"Ela", "Ines"})),
        ("member", "Climbing club", frozenset({"Ela", "Deniz"})),
        ("member", "Climbing club", frozenset({"Ela", "Kaan"})),
    }


def test_an_outsider_sees_only_themselves(world):
    graph = visible_graph(access(world, "sofia"))

    assert [p.name for p in graph.people.values()] == ["Sofia"]
    assert graph.edges == []


@pytest.mark.parametrize("who", USERS)
def test_the_graph_never_reaches_beyond_what_the_user_can_see(world, who):
    a = access(world, who)
    graph = visible_graph(a)
    allowed_links = set(visible_relationships(a))

    for edge in graph.edges:
        assert edge.a in graph.people and edge.b in graph.people
        if edge.kind == EdgeKind.RELATIONSHIP:
            assert edge.relationship in allowed_links
    assert len({edge.id for edge in graph.edges}) == len(graph.edges)


def test_people_carry_their_visible_spaces_for_colors(world):
    graph = visible_graph(access(world, "ela"))

    assert [s.name for s in graph.spaces_of[world.oskar.pk]] == ["Climbing club"]
    assert [s.name for s in graph.spaces_of[world.tom.pk]] == ["Hackathon 2026"]
    assert world.emma.pk not in graph.spaces_of


def test_graph_query_count_does_not_grow_with_the_book(world):
    def queries():
        with CaptureQueriesContext(connection) as captured:
            visible_graph(access(world, "ela"))
        return len(captured)

    before = queries()
    for _ in range(20):
        person = PersonFactory(owner=world.ela)
        world.climbing.people.add(person)
        RelationshipFactory(owner=world.ela, person_a=person, person_b=world.oskar)

    assert queries() == before == 5


# ---------------------------------------------------------------- paths


def test_how_do_i_know_tom_through_defnes_space(world):
    (path,) = paths_to(access(world, "ela"), world.tom)

    assert names_on(world, path) == ["Defne", "Tom"]
    assert [hop.edge.kind for hop in path] == [EdgeKind.MEMBER, EdgeKind.SPACE]


def test_a_stored_link_is_preferred_over_sharing_a_space(world):
    RelationshipFactory(owner=world.ela, person_a=world.ela.me, person_b=world.defne.me)

    (path,) = paths_to(access(world, "ela"), world.tom)

    assert names_on(world, path) == ["Defne", "Tom"]
    assert path[0].edge.kind == EdgeKind.RELATIONSHIP
    assert path[0].edge.relationship.type == "friend"


def test_alternative_routes_start_with_a_different_first_step(world):
    # The design's example: Me → Defne (friend) → Tom, "also via Emma: friend, then cousin".
    RelationshipFactory(owner=world.ela, person_a=world.ela.me, person_b=world.defne.me)
    RelationshipFactory(owner=world.ela, person_a=world.ela.me, person_b=world.emma)
    RelationshipFactory(owner=world.ela, person_a=world.emma, person_b=world.tom, type="cousin")

    paths = paths_to(access(world, "ela"), world.tom, alternatives=2)

    assert [names_on(world, p) for p in paths] == [
        ["Defne", "Tom"],
        ["Emma", "Tom"],
        ["Oskar", "Emma", "Tom"],
    ]


def test_a_route_of_stored_links_beats_one_through_a_shared_space(world):
    RelationshipFactory(owner=world.ela, person_a=world.ela.me, person_b=world.emma)
    RelationshipFactory(owner=world.ela, person_a=world.emma, person_b=world.tom, type="cousin")

    best, *_ = paths_to(access(world, "ela"), world.tom)

    assert names_on(world, best) == ["Emma", "Tom"]
    assert {hop.edge.kind for hop in best} == {EdgeKind.RELATIONSHIP}


def test_alternatives_can_be_limited(world):
    RelationshipFactory(owner=world.ela, person_a=world.ela.me, person_b=world.emma)
    RelationshipFactory(owner=world.ela, person_a=world.emma, person_b=world.tom, type="cousin")

    assert len(paths_to(access(world, "ela"), world.tom, alternatives=1)) == 2
    assert len(paths_to(access(world, "ela"), world.tom, alternatives=0)) == 1


def test_a_viewer_reaches_people_through_the_space_owner(world):
    (path,) = paths_to(access(world, "kaan"), world.ines)

    assert names_on(world, path, who="kaan") == ["Ela", "Ines"]


@pytest.mark.parametrize(
    ("who", "target"),
    [
        ("ela", "jin"),  # can't see Jin
        ("sofia", "oskar"),  # can't see Oskar
    ],
)
def test_no_path_to_someone_you_cannot_see(world, who, target):
    assert paths_to(access(world, who), getattr(world, target)) == []


def test_no_path_to_someone_with_no_connections(world):
    loner = PersonFactory(owner=world.ela)

    assert paths_to(access(world, "ela"), loner) == []


def test_no_path_to_yourself(world):
    assert paths_to(access(world, "ela"), world.ela.me) == []


# ---------------------------------------------------------------- focus mode


@pytest.mark.parametrize(
    ("hops", "expected"),
    [
        (1, {"Oskar", "Emma", "Ines", "Ela"}),
        (2, {"Oskar", "Emma", "Ines", "Ela", "Deniz", "Kaan", "Defne"}),
    ],
)
def test_neighborhood(world, hops, expected):
    graph = neighborhood(access(world, "ela"), world.oskar, hops=hops)

    assert {p.name for p in graph.people.values()} == expected
    assert all(e.a in graph.people and e.b in graph.people for e in graph.edges)


def test_neighborhood_of_someone_you_cannot_see_is_empty(world):
    graph = neighborhood(access(world, "ela"), world.jin, hops=2)

    assert graph.people == {} and graph.edges == []
