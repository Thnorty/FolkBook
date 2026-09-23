"""Derived family relations: who is whose sibling, cousin, in-law, …

Only parents, partners and "other family" direct links are stored. Everything
else is worked out here, from the links the viewer is allowed to see, so the
answer is always up to date: end a partnership and the in-laws become former
in-laws; add two parents and a direct "sibling" link is explained by them.

The derivation works on plain data (`Link`), so it can be tested without a
database. `family_of()` feeds it the viewer's visible links.
"""

from collections import defaultdict
from collections.abc import Hashable, Iterable
from dataclasses import dataclass, replace
from enum import StrEnum

from access.policy import Access, visible_people, visible_relationships
from people.models import Person
from relationships.models import FAMILY_TYPES, ParentType, RelationshipType

PersonId = Hashable


class Relation(StrEnum):
    """How someone is related to the focus person ("X is the focus person's …")."""

    PARENT = "parent"
    CHILD = "child"
    PARTNER = "partner"
    SIBLING = "sibling"
    HALF_SIBLING = "half_sibling"
    STEP_SIBLING = "step_sibling"
    STEP_PARENT = "step_parent"
    STEP_CHILD = "step_child"
    GRANDPARENT = "grandparent"
    GRANDCHILD = "grandchild"
    AUNT_UNCLE = "aunt_uncle"
    NIECE_NEPHEW = "niece_nephew"
    COUSIN = "cousin"
    PARENT_IN_LAW = "parent_in_law"
    CHILD_IN_LAW = "child_in_law"
    SIBLING_IN_LAW = "sibling_in_law"


@dataclass(frozen=True)
class Link:
    """A stored family link, as plain data."""

    id: Hashable
    a: PersonId
    b: PersonId
    type: str
    parent_type: str = ""
    is_former: bool = False


@dataclass(frozen=True)
class FamilyRelation:
    person: PersonId
    relation: Relation
    derived: bool  # worked out from other links, rather than stored directly
    former: bool = False  # e.g. in-laws through a partnership that ended
    parent_type: str = ""  # for parents and children: biological / adoptive / step
    # A stored "other family" link that the derivation now explains (and could replace).
    direct_link: Hashable | None = None


SIBLINGS = frozenset({Relation.SIBLING, Relation.HALF_SIBLING, Relation.STEP_SIBLING})


class FamilyGraph:
    def __init__(self, links: Iterable[Link]):
        self.parents: dict[PersonId, dict[PersonId, str]] = defaultdict(dict)
        self.children: dict[PersonId, dict[PersonId, str]] = defaultdict(dict)
        self.partners: dict[PersonId, dict[PersonId, bool]] = defaultdict(dict)
        # Direct "other family" links: (person, relation of `other` to `person`) -> link id.
        self.direct: dict[PersonId, dict[tuple[PersonId, Relation], Hashable]] = defaultdict(dict)

        for link in links:
            self._add(link)

    def _add(self, link: Link) -> None:
        a, b = link.a, link.b
        match link.type:
            case RelationshipType.PARENT:
                self.parents[b][a] = link.parent_type
                self.children[a][b] = link.parent_type
            case RelationshipType.PARTNER:
                # A current partnership wins over an old, ended one.
                self.partners[a][b] = self.partners[a].get(b, True) and link.is_former
                self.partners[b][a] = self.partners[a][b]
            case RelationshipType.SIBLING:
                self._direct(a, b, Relation.SIBLING, Relation.SIBLING, link.id)
            case RelationshipType.COUSIN:
                self._direct(a, b, Relation.COUSIN, Relation.COUSIN, link.id)
            case RelationshipType.GRANDPARENT:
                self._direct(a, b, Relation.GRANDPARENT, Relation.GRANDCHILD, link.id)
            case RelationshipType.AUNT_UNCLE:
                self._direct(a, b, Relation.AUNT_UNCLE, Relation.NIECE_NEPHEW, link.id)

    def _direct(self, a, b, a_to_b: Relation, b_to_a: Relation, link_id) -> None:
        """Store "a is b's `a_to_b`" and its inverse "b is a's `b_to_a`"."""
        self.direct[b][(a, a_to_b)] = link_id
        self.direct[a][(b, b_to_a)] = link_id

    # ------------------------------------------------------------ building blocks

    def current_partners(self, x: PersonId) -> set[PersonId]:
        return {y for y, former in self.partners[x].items() if not former}

    def _non_step_parents(self, x: PersonId) -> set[PersonId]:
        return {p for p, kind in self.parents[x].items() if kind != ParentType.STEP}

    def siblings(self, x: PersonId) -> dict[PersonId, Relation]:
        """Siblings through shared parents or parents' partners (no direct links)."""
        found: dict[PersonId, Relation] = {}
        for parent in self.parents[x]:
            for child in self.children[parent]:
                if child != x:
                    found[child] = self._sibling_kind(x, child)
            for partner in self.current_partners(parent):
                for child in self.children[partner]:
                    if child != x and child not in found and partner not in self.parents[x]:
                        found[child] = Relation.STEP_SIBLING
        return found

    def _sibling_kind(self, x: PersonId, y: PersonId) -> Relation:
        x_parents, y_parents = self._non_step_parents(x), self._non_step_parents(y)
        shared = x_parents & y_parents
        if not shared:
            return Relation.STEP_SIBLING
        if (x_parents - shared) and (y_parents - shared):
            return Relation.HALF_SIBLING
        return Relation.SIBLING

    def all_siblings(self, x: PersonId) -> set[PersonId]:
        """Siblings however we know them: derived or linked directly."""
        direct = {p for (p, rel) in self.direct[x] if rel == Relation.SIBLING}
        return set(self.siblings(x)) | direct

    def _direct_to(self, x: PersonId, relation: Relation) -> set[PersonId]:
        return {p for (p, rel) in self.direct[x] if rel == relation}

    # ------------------------------------------------------------ the relations

    def relations_of(self, x: PersonId) -> list[FamilyRelation]:
        derived: dict[tuple[PersonId, Relation], FamilyRelation] = {}

        def add(person, relation, *, is_derived=True, former=False, parent_type=""):
            if person == x or (person, relation) in derived:
                return
            derived[(person, relation)] = FamilyRelation(
                person, relation, is_derived, former, parent_type
            )

        for parent, kind in self.parents[x].items():
            add(parent, Relation.PARENT, is_derived=False, parent_type=kind)
        for child, kind in self.children[x].items():
            add(child, Relation.CHILD, is_derived=False, parent_type=kind)
        for partner, former in self.partners[x].items():
            add(partner, Relation.PARTNER, is_derived=False, former=former)

        for sibling, kind in self.siblings(x).items():
            add(sibling, kind)
        for parent in self.parents[x]:
            for step_parent in self.current_partners(parent) - set(self.parents[x]):
                add(step_parent, Relation.STEP_PARENT)
        for partner in self.current_partners(x):
            for step_child in set(self.children[partner]) - set(self.children[x]):
                add(step_child, Relation.STEP_CHILD)

        for parent in self.parents[x]:
            for grandparent in self.parents[parent]:
                add(grandparent, Relation.GRANDPARENT)
        for child in self.children[x]:
            for grandchild in self.children[child]:
                add(grandchild, Relation.GRANDCHILD)

        parents_siblings: set[PersonId] = set()
        for parent in self.parents[x]:
            parents_siblings |= self.all_siblings(parent) - set(self.parents[x])
        for aunt_uncle in parents_siblings:
            add(aunt_uncle, Relation.AUNT_UNCLE)
        # Direct aunt/uncle links aren't derived themselves, but their family is.
        for aunt_uncle in parents_siblings | self._direct_to(x, Relation.AUNT_UNCLE):
            for partner in self.current_partners(aunt_uncle) - set(self.parents[x]):
                add(partner, Relation.AUNT_UNCLE)
            for cousin in self.children[aunt_uncle]:
                add(cousin, Relation.COUSIN)
        for sibling in self.all_siblings(x):
            for niece_nephew in self.children[sibling]:
                add(niece_nephew, Relation.NIECE_NEPHEW)

        for partner, former in self.partners[x].items():
            for parent_in_law in self.parents[partner]:
                add(parent_in_law, Relation.PARENT_IN_LAW, former=former)
            for sibling_in_law in self.all_siblings(partner):
                add(sibling_in_law, Relation.SIBLING_IN_LAW, former=former)
        for sibling in self.all_siblings(x):
            for partner, former in self.partners[sibling].items():
                add(partner, Relation.SIBLING_IN_LAW, former=former)
        for child in self.children[x]:
            for partner, former in self.partners[child].items():
                add(partner, Relation.CHILD_IN_LAW, former=former)

        return self._with_direct_links(x, derived)

    def _with_direct_links(
        self, x: PersonId, derived: dict[tuple[PersonId, Relation], FamilyRelation]
    ) -> list[FamilyRelation]:
        """Add direct "other family" links; mark those the derivation already explains."""
        results = dict(derived)
        for (person, relation), link_id in self.direct[x].items():
            if person == x:
                continue
            explained = next(
                (
                    key
                    for key in derived
                    if key[0] == person and (key[1] == relation or {key[1], relation} <= SIBLINGS)
                ),
                None,
            )
            if explained:
                results[explained] = replace(results[explained], direct_link=link_id)
            else:
                results[(person, relation)] = FamilyRelation(
                    person, relation, derived=False, direct_link=link_id
                )
        order = list(Relation)
        return sorted(results.values(), key=lambda r: (order.index(r.relation), str(r.person)))


def family_of(access: Access, person: Person) -> list[FamilyRelation]:
    """The family of `person`, from the links `access` is allowed to see.

    Each result's `person` is a `Person`. Two queries: the links, then the people.
    """
    links = visible_relationships(access).filter(type__in=sorted(FAMILY_TYPES))
    graph = FamilyGraph(
        Link(
            link.pk, link.person_a_id, link.person_b_id, link.type, link.parent_type, link.is_former
        )
        for link in links
    )
    relations = graph.relations_of(person.pk)
    people = visible_people(access).in_bulk([r.person for r in relations])
    return [replace(r, person=people[r.person]) for r in relations if r.person in people]
