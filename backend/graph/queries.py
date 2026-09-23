"""The network: everyone the viewer can see, and how they're connected.

Edges come in three kinds, all built from data the viewer is allowed to see
(through `access.policy`):

- relationship: a stored link (friend, parent, met at …)
- space: a space's owner knows the people they put in it
  (how "Me → Defne → Tom" works when Tom is in Defne's Hackathon space)
- member: a space's owner and each member share that space

The whole visible graph is loaded in a handful of queries and walked in
Python. Personal books are small enough (hundreds to a few thousand people)
that this is fast, and it keeps every query inside the permission layer.
"""

from collections import deque
from dataclasses import dataclass, field
from enum import StrEnum
from functools import cached_property
from uuid import UUID

from django.db.models import F

from access.policy import Access, visible_people, visible_relationships, visible_spaces
from people.models import Person
from relationships.models import Relationship
from spaces.models import Space, SpaceMembership, SpacePerson


class EdgeKind(StrEnum):
    RELATIONSHIP = "relationship"
    SPACE = "space"
    MEMBER = "member"


# Which edge describes a pair best when there are several: stored links first.
_PRIORITY = {EdgeKind.RELATIONSHIP: 0, EdgeKind.MEMBER: 2, EdgeKind.SPACE: 3}


@dataclass(frozen=True)
class Edge:
    id: str
    a: UUID
    b: UUID
    kind: EdgeKind
    space: Space | None = None
    relationship: Relationship | None = None

    @property
    def is_former(self) -> bool:
        return bool(self.relationship and self.relationship.is_former)

    @property
    def priority(self) -> int:
        return _PRIORITY[self.kind] + (1 if self.is_former else 0)


@dataclass(frozen=True)
class Hop:
    source: UUID
    target: UUID
    edge: Edge


Path = list[Hop]


@dataclass(frozen=True)
class Graph:
    people: dict[UUID, Person]
    edges: list[Edge]
    # Visible spaces each person was added to (for clustering and colors).
    spaces_of: dict[UUID, list[Space]] = field(default_factory=dict)

    @cached_property
    def neighbors(self) -> dict[UUID, list[tuple[UUID, Edge]]]:
        """For each person: their neighbors, best edge per neighbor, in a stable order."""
        best: dict[UUID, dict[UUID, Edge]] = {pid: {} for pid in self.people}
        for edge in self.edges:
            for here, there in ((edge.a, edge.b), (edge.b, edge.a)):
                current = best[here].get(there)
                if current is None or edge.priority < current.priority:
                    best[here][there] = edge
        return {
            pid: sorted(
                by_neighbor.items(),
                key=lambda item: (item[1].priority, self.people[item[0]].name, str(item[0])),
            )
            for pid, by_neighbor in best.items()
        }

    def subgraph(self, person_ids: set[UUID]) -> "Graph":
        return Graph(
            people={pid: p for pid, p in self.people.items() if pid in person_ids},
            edges=[e for e in self.edges if e.a in person_ids and e.b in person_ids],
            spaces_of={pid: s for pid, s in self.spaces_of.items() if pid in person_ids},
        )

    def shortest_path(
        self, source: UUID, target: UUID, blocked: frozenset[UUID] = frozenset()
    ) -> Path | None:
        """Fewest hops from source to target, avoiding `blocked`. None if unreachable."""
        if source == target:
            return []
        came_from: dict[UUID, Hop] = {}
        queue = deque([source])
        seen = {source, *blocked}
        while queue:
            here = queue.popleft()
            for there, edge in self.neighbors.get(here, []):
                if there in seen:
                    continue
                seen.add(there)
                came_from[there] = Hop(here, there, edge)
                if there == target:
                    return self._walk_back(came_from, source, target)
                queue.append(there)
        return None

    @staticmethod
    def _walk_back(came_from: dict[UUID, Hop], source: UUID, target: UUID) -> Path:
        path: Path = []
        node = target
        while node != source:
            hop = came_from[node]
            path.append(hop)
            node = hop.source
        return path[::-1]


def visible_graph(access: Access) -> Graph:
    """Everyone the viewer can see and every connection between them."""
    people = {p.pk: p for p in visible_people(access)}
    spaces = {s.pk: s for s in visible_spaces(access).annotate(owner_me_id=F("owner__me__id"))}
    edges: list[Edge] = []

    def connect(edge: Edge) -> None:
        if edge.a in people and edge.b in people and edge.a != edge.b:
            edges.append(edge)

    for link in visible_relationships(access).select_related("space"):
        connect(
            Edge(
                f"relationship:{link.pk}",
                link.person_a_id,
                link.person_b_id,
                EdgeKind.RELATIONSHIP,
                space=link.space,
                relationship=link,
            )
        )

    spaces_of: dict[UUID, list[Space]] = {}
    in_space = SpacePerson.objects.filter(space__in=spaces).values_list("space_id", "person_id")
    for space_id, person_id in in_space:
        space = spaces[space_id]
        spaces_of.setdefault(person_id, []).append(space)
        connect(
            Edge(
                f"space:{space_id}:{person_id}", space.owner_me_id, person_id, EdgeKind.SPACE, space
            )
        )

    members = SpaceMembership.objects.filter(space__in=spaces).values_list(
        "space_id", "user__me__id"
    )
    for space_id, member_me_id in members:
        space = spaces[space_id]
        connect(
            Edge(
                f"member:{space_id}:{member_me_id}",
                space.owner_me_id,
                member_me_id,
                EdgeKind.MEMBER,
                space,
            )
        )

    for person_spaces in spaces_of.values():
        person_spaces.sort(key=lambda s: s.name.casefold())
    return Graph(people=people, edges=edges, spaces_of=spaces_of)


def neighborhood(access: Access, person: Person, hops: int = 1) -> Graph:
    """A person and everyone within `hops` steps of them (focus mode)."""
    graph = visible_graph(access)
    if person.pk not in graph.people:
        return Graph(people={}, edges=[])
    included = {person.pk}
    frontier = {person.pk}
    for _ in range(hops):
        frontier = {there for here in frontier for there, _ in graph.neighbors[here]} - included
        included |= frontier
    return graph.subgraph(included)


def paths_to(
    access: Access, target: Person, alternatives: int = 2, graph: Graph | None = None
) -> list[Path]:
    """How do I know …? The shortest path from the viewer's Me to `target`.

    Also returns up to `alternatives` other routes, each starting with a
    different first step (e.g. "also via Emma"), shortest first. Empty when
    the target can't be reached or is the viewer themselves. Pass `graph` to
    reuse one that's already loaded for `access`.
    """
    graph = graph or visible_graph(access)
    source = access.user.me.pk
    if target.pk not in graph.people or target.pk == source:
        return []
    best = graph.shortest_path(source, target.pk)
    if best is None:
        return []

    others: list[Path] = []
    for first, edge in graph.neighbors[source]:
        if first == best[0].target:
            continue
        rest = graph.shortest_path(first, target.pk, blocked=frozenset({source}))
        if rest is not None:
            others.append([Hop(source, first, edge), *rest])
    others.sort(key=len)  # stable: ties keep the neighbor order
    return [best, *others[:alternatives]]
