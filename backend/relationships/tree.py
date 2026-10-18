"""A family tree: everyone linked to one person (the root) by family, by generation.

The tree reaches as far as family links go, with two limits that keep it one family:
it crosses at most one partnership that isn't the root's or an ancestor's (so a
sister-in-law comes in, her own family doesn't), and everyone who is only there
through someone's partner is flagged `in_law`; everyone only there through a
partnership that ended is flagged `via_former`. The page's toggles filter on those.

Like `family.py`, it works on plain data (`Link`), so it's tested without a database.
"""

import heapq
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from enum import Enum
from itertools import count

from relationships.family import Link, PersonId
from relationships.models import RelationshipType


class Kind(Enum):
    """How someone came into the tree; it decides where the walk may go from them."""

    ROOT = "root"
    LINE = "line"  # an ancestor: reached from the root by parent links only, going up
    UPPER = "upper"  # family through a direct link, before any step down (an aunt, her parents)
    BLOOD = "blood"  # family after a step down: going up from here meets a child's other parent
    ROOT_PARTNER = "root_partner"
    STEP = "step"  # an ancestor's partner
    STEP_CHILD = "step_child"  # their child, or the root's partner's child
    PARTNER_FAMILY = "partner_family"  # the family of the root's partner
    LEAF = "leaf"  # someone's partner, who brings no family of their own

    @property
    def rank(self) -> int:
        """Closer kin first, when two routes are otherwise as good."""
        return _RANKS[self]


class Move(Enum):
    UP = "up"  # to a parent
    DOWN = "down"  # to a child
    DIRECT = "direct"  # along an "other family" link
    PARTNER = "partner"


def _next(kind: Kind, move: Move) -> Kind | None:
    """Where a move from someone of `kind` leads, or None when the walk stops there."""
    if move is Move.PARTNER:
        if kind is Kind.ROOT:
            return Kind.ROOT_PARTNER
        if kind is Kind.LINE:
            return Kind.STEP
        return None if kind is Kind.LEAF else Kind.LEAF
    match kind:
        case Kind.ROOT | Kind.LINE:
            return {Move.UP: Kind.LINE, Move.DIRECT: Kind.UPPER}.get(move, Kind.BLOOD)
        case Kind.UPPER:
            return Kind.BLOOD if move is Move.DOWN else Kind.UPPER
        case Kind.BLOOD:
            # A child's other parent who isn't family: an in-law, without their family.
            return Kind.LEAF if move is Move.UP else Kind.BLOOD
        case Kind.ROOT_PARTNER:
            return Kind.STEP_CHILD if move is Move.DOWN else Kind.PARTNER_FAMILY
        case Kind.PARTNER_FAMILY:
            return Kind.PARTNER_FAMILY
        case Kind.STEP:
            return Kind.STEP_CHILD if move is Move.DOWN else None
    return None


_RANKS = {
    Kind.ROOT: 0,
    Kind.LINE: 0,
    Kind.UPPER: 1,
    Kind.BLOOD: 1,
    Kind.ROOT_PARTNER: 2,
    Kind.STEP: 3,
    Kind.STEP_CHILD: 4,
    Kind.PARTNER_FAMILY: 5,
    Kind.LEAF: 6,
}
IN_LAW_KINDS = frozenset({Kind.PARTNER_FAMILY, Kind.LEAF})


@dataclass(frozen=True)
class TreePerson:
    person: PersonId
    generation: int  # the root 0, parents +1, children -1
    in_law: bool
    via_former: bool


@dataclass(frozen=True)
class _Reached:
    person: PersonId
    kind: Kind
    generation: int
    in_law: bool
    via_former: bool
    distance: int
    previous: PersonId | None = None
    link: Link | None = None

    @property
    def key(self) -> tuple:
        """Better first: not through an ex, not an in-law, closer, closer kin."""
        return (self.via_former, self.in_law, self.distance, self.kind.rank)


# "a is b's …" for a directional direct link: how many generations a is above b.
_DIRECT_UP = {RelationshipType.GRANDPARENT: 2, RelationshipType.AUNT_UNCLE: 1}


def _moves(links: Iterable[Link]) -> dict[PersonId, list[tuple[PersonId, Move, int, Link]]]:
    """From each person: (other person, move, generations up, link)."""
    moves = defaultdict(list)
    for link in links:
        a, b = link.a, link.b
        match link.type:
            case RelationshipType.PARENT:
                moves[b].append((a, Move.UP, 1, link))
                moves[a].append((b, Move.DOWN, -1, link))
            case RelationshipType.PARTNER:
                moves[a].append((b, Move.PARTNER, 0, link))
                moves[b].append((a, Move.PARTNER, 0, link))
            case RelationshipType.SIBLING | RelationshipType.COUSIN:
                moves[a].append((b, Move.DIRECT, 0, link))
                moves[b].append((a, Move.DIRECT, 0, link))
            case RelationshipType.GRANDPARENT | RelationshipType.AUNT_UNCLE:
                up = _DIRECT_UP[link.type]
                moves[b].append((a, Move.DIRECT, up, link))
                moves[a].append((b, Move.DIRECT, -up, link))
    return moves


def _reach(links: Iterable[Link], root: PersonId) -> dict[PersonId, _Reached]:
    """Everyone in the tree, each by their best route from the root."""
    moves = _moves(links)
    order = count()  # keeps the heap's order stable for equal keys
    start = _Reached(root, Kind.ROOT, 0, False, False, 0)
    queue = [(start.key, next(order), start)]
    fixed: dict[PersonId, _Reached] = {}
    while queue:
        _, _, here = heapq.heappop(queue)
        if here.person in fixed:
            continue
        fixed[here.person] = here
        for other, move, up, link in moves[here.person]:
            kind = _next(here.kind, move)
            if kind is None or other in fixed:
                continue
            there = _Reached(
                other,
                kind,
                here.generation + up,
                here.in_law or kind in IN_LAW_KINDS,
                here.via_former or (move is Move.PARTNER and link.is_former),
                here.distance + 1,
                here.person,
                link,
            )
            heapq.heappush(queue, (there.key, next(order), there))
    return fixed


def walk(links: Iterable[Link], root: PersonId) -> list[TreePerson]:
    """The tree of `root`: everyone in it, highest generation first."""
    reached = _reach(links, root)
    people = [TreePerson(r.person, r.generation, r.in_law, r.via_former) for r in reached.values()]
    return sorted(people, key=lambda p: (-p.generation, str(p.person)))
