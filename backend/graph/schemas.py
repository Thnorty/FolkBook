from uuid import UUID

from ninja import Schema

from graph.queries import EdgeKind
from people.schemas import PersonRef, SpaceRef


class GraphNodeOut(Schema):
    id: UUID
    name: str
    is_me: bool  # the viewer's own Me: the center of the graph
    spaces: list[SpaceRef]  # visible spaces the person is in, for cluster colors


class GraphEdgeOut(Schema):
    """A connection. `type`/`label` are set for stored links, `space` for space edges."""

    id: str
    source: UUID
    target: UUID
    kind: EdgeKind
    type: str | None
    label: str
    former: bool
    space: SpaceRef | None


class GraphOut(Schema):
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]


class HopOut(Schema):
    source: PersonRef
    target: PersonRef
    kind: EdgeKind
    type: str | None
    label: str
    space: SpaceRef | None


class PathOut(Schema):
    hops: list[HopOut]


class PathsOut(Schema):
    """The shortest route first, then alternatives with a different first step."""

    paths: list[PathOut]
