from uuid import UUID

from ninja import Schema

from graph.queries import EdgeKind
from people.models import Pronouns
from people.schemas import PersonRef, SpaceRef


class GraphNodeOut(Schema):
    id: UUID
    name: str
    is_me: bool  # the viewer's own Me: the center of the graph
    spaces: list[SpaceRef]  # visible spaces the person is in, for cluster colors
    photo_url: str | None  # the small photo, for the node's face


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
    id: str  # the graph's line this step goes along (GraphEdgeOut.id)
    source: PersonRef
    target: PersonRef
    kind: EdgeKind
    type: str | None
    label: str
    former: bool  # an ended link ("former partner")
    space: SpaceRef | None


class PathOut(Schema):
    hops: list[HopOut]


class PathsOut(Schema):
    """The shortest route first, then alternatives with a different first step."""

    paths: list[PathOut]


class TreeStepOut(Schema):
    """One step of how someone is related ("grandmother's cousin" is two)."""

    relation: str  # a family relation code, or "relative"
    pronouns: Pronouns | None  # the step's own person's, for "grandmother"
    parent_type: str
    former: bool


class TreePersonOut(Schema):
    id: UUID
    name: str
    photo_url: str | None
    is_me: bool
    pronouns: Pronouns | None
    generation: int  # the tree's person 0, parents 1, children -1
    relation: list[TreeStepOut]  # empty for the tree's person
    in_law: bool  # only there through someone's partner: the In-laws toggle
    via_former: bool  # only there through a partnership that ended: Former partners
    missing_parents: int  # 0-2, for "Add parent" slots


class TreeLinkOut(Schema):
    """A stored family link. For parents, `source` is the parent of `target`."""

    id: UUID
    type: str
    source: UUID
    target: UUID
    parent_type: str
    former: bool


class FamilyTreeOut(Schema):
    root: UUID
    people: list[TreePersonOut]
    links: list[TreeLinkOut]
