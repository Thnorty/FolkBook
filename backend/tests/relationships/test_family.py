"""Derived family relations, table-driven on plain data (no database).

Links are written as short strings: "A parent B" means A is B's parent.
Modifiers: "parent:step", "parent:adoptive", "partner:former".
"""

import pytest

from relationships.family import FamilyGraph, FamilyRelation, Link, Relation

R = Relation


def graph(*specs: str) -> FamilyGraph:
    links = []
    for index, spec in enumerate(specs):
        a, kind, b = spec.split()
        type_, _, modifier = kind.partition(":")
        links.append(
            Link(
                id=f"link{index}",
                a=a,
                b=b,
                type=type_,
                parent_type=(modifier or "biological") if type_ == "parent" else "",
                is_former=modifier == "former",
            )
        )
    return FamilyGraph(links)


def summary(relations: list[FamilyRelation]) -> set[tuple]:
    """(person, relation) plus "former" when it applies. Enough to compare whole families."""
    return {
        (r.person, r.relation, "former") if r.former else (r.person, r.relation) for r in relations
    }


# Ela's family, based on the family tree in the design (screen 3k).
ELA = [
    "Orhan parent Murat",
    "Leyla parent Murat",
    "Murat parent Ela",
    "Nilgün parent Ela",
    "Murat partner:former Nilgün",
    "Hakan partner Nilgün",
    "Hakan parent:step Ela",
    "Murat parent Can",
    "Nilgün parent Can",
    "Can partner Zeynep",
    "Can parent Emir",
    "Zeynep parent Emir",
    "Ela partner Mateo",
    "Ela parent:adoptive Lina",
    "Mateo parent:adoptive Lina",
    "Rosa parent Mateo",
    "Mateo sibling Diego",  # direct: Mateo's parents aren't in the book
    "Murat sibling Selim",  # direct
    "Selim parent Aylin",
    "Nilgün sibling Sevgi",  # direct
    "Sevgi partner Kemal",
]


def test_elas_whole_family():
    relations = graph(*ELA).relations_of("Ela")

    assert summary(relations) == {
        ("Murat", R.PARENT),
        ("Nilgün", R.PARENT),
        ("Hakan", R.PARENT),  # stored as a step-parent
        ("Lina", R.CHILD),
        ("Mateo", R.PARTNER),
        ("Can", R.SIBLING),
        ("Orhan", R.GRANDPARENT),
        ("Leyla", R.GRANDPARENT),
        ("Selim", R.AUNT_UNCLE),
        ("Sevgi", R.AUNT_UNCLE),
        ("Kemal", R.AUNT_UNCLE),  # by marriage
        ("Aylin", R.COUSIN),
        ("Emir", R.NIECE_NEPHEW),
        ("Rosa", R.PARENT_IN_LAW),
        ("Diego", R.SIBLING_IN_LAW),
        ("Zeynep", R.SIBLING_IN_LAW),
    }


def test_stored_links_are_not_derived_and_keep_their_parent_type():
    relations = {(r.person, r.relation): r for r in graph(*ELA).relations_of("Ela")}

    assert relations[("Hakan", R.PARENT)].parent_type == "step"
    assert relations[("Lina", R.CHILD)].parent_type == "adoptive"
    assert not relations[("Murat", R.PARENT)].derived
    assert not relations[("Mateo", R.PARTNER)].derived
    assert relations[("Can", R.SIBLING)].derived
    assert relations[("Aylin", R.COUSIN)].derived


def test_after_a_divorce_the_in_laws_become_former():
    family = [spec.replace("Ela partner Mateo", "Ela partner:former Mateo") for spec in ELA]

    relations = summary(graph(*family).relations_of("Ela"))

    assert ("Mateo", R.PARTNER, "former") in relations
    assert ("Rosa", R.PARENT_IN_LAW, "former") in relations
    assert ("Diego", R.SIBLING_IN_LAW, "former") in relations
    assert ("Lina", R.CHILD) in relations  # parent links never end


def test_the_other_side_sees_the_same_family_from_their_view():
    relations = summary(graph(*ELA).relations_of("Emir"))

    assert {
        ("Can", R.PARENT),
        ("Zeynep", R.PARENT),
        ("Ela", R.AUNT_UNCLE),
        ("Murat", R.GRANDPARENT),
        ("Nilgün", R.GRANDPARENT),
        ("Lina", R.COUSIN),
    } <= relations


@pytest.mark.parametrize(
    ("links", "focus", "expected"),
    [
        pytest.param(
            ["A parent X", "B parent X", "A parent Y", "B parent Y"],
            "X",
            {("A", R.PARENT), ("B", R.PARENT), ("Y", R.SIBLING)},
            id="full siblings share both parents",
        ),
        pytest.param(
            ["A parent X", "B parent X", "A parent Y", "C parent Y"],
            "X",
            {("A", R.PARENT), ("B", R.PARENT), ("Y", R.HALF_SIBLING)},
            id="half siblings share one parent and each has another",
        ),
        pytest.param(
            ["A parent X", "A parent Y", "B parent Y"],
            "X",
            {("A", R.PARENT), ("Y", R.SIBLING)},
            id="one parent unknown: just siblings",
        ),
        pytest.param(
            ["A parent X", "A partner B", "B parent Y"],
            "X",
            {("A", R.PARENT), ("B", R.STEP_PARENT), ("Y", R.STEP_SIBLING)},
            id="a parent's partner and their child",
        ),
        pytest.param(
            ["A parent X", "A partner:former B", "B parent Y"],
            "X",
            {("A", R.PARENT)},
            id="no step family through an ended partnership",
        ),
        pytest.param(
            ["A parent X", "S parent:step X", "S parent Y"],
            "X",
            {("A", R.PARENT), ("S", R.PARENT), ("Y", R.STEP_SIBLING)},
            id="stored step-parent's child is a step-sibling",
        ),
        pytest.param(
            ["X partner P", "P parent C"],
            "X",
            {("P", R.PARTNER), ("C", R.STEP_CHILD)},
            id="a partner's child is a step-child",
        ),
        pytest.param(
            ["X parent C", "C parent G"],
            "X",
            {("C", R.CHILD), ("G", R.GRANDCHILD)},
            id="grandchild",
        ),
        pytest.param(
            ["X parent C", "C partner D", "C partner:former E"],
            "X",
            {("C", R.CHILD), ("D", R.CHILD_IN_LAW), ("E", R.CHILD_IN_LAW, "former")},
            id="children's partners, current and former",
        ),
        pytest.param(
            ["X partner:former P", "X partner P"],
            "X",
            {("P", R.PARTNER)},
            id="together again: the current partnership wins",
        ),
        pytest.param(
            ["X cousin Y"],
            "Y",
            {("X", R.COUSIN)},
            id="direct cousin link",
        ),
        pytest.param(
            ["G grandparent X"],
            "G",
            {("X", R.GRANDCHILD)},
            id="direct grandparent link, seen from the grandparent",
        ),
        pytest.param(
            ["U aunt_uncle X", "U parent C", "U partner P"],
            "X",
            {("U", R.AUNT_UNCLE), ("C", R.COUSIN), ("P", R.AUNT_UNCLE)},
            id="a direct aunt's children are cousins, her partner an uncle",
        ),
        pytest.param(
            ["U aunt_uncle X"],
            "U",
            {("X", R.NIECE_NEPHEW)},
            id="direct aunt link, seen from the aunt",
        ),
        pytest.param(
            ["A parent X", "Y sibling X"],
            "Y",
            {("X", R.SIBLING)},
            id="a sibling's parent isn't derived as a parent",
        ),
        pytest.param(["A parent X"], "Z", set(), id="someone outside the family"),
    ],
)
def test_family_rules(links, focus, expected):
    assert summary(graph(*links).relations_of(focus)) == expected


def test_a_direct_link_the_parents_now_explain_is_marked_as_derived():
    relations = graph("X sibling Y", "A parent X", "A parent Y").relations_of("X")

    sibling = next(r for r in relations if r.person == "Y")
    assert sibling.relation == R.SIBLING
    assert sibling.derived
    assert sibling.direct_link == "link0"  # could now be removed


def test_a_direct_link_on_its_own_is_not_derived():
    (cousin,) = graph("X cousin Y").relations_of("X")

    assert not cousin.derived
    assert cousin.direct_link == "link0"


def test_a_derived_half_sibling_explains_a_direct_sibling_link():
    relations = graph(
        "X sibling Y", "A parent X", "B parent X", "A parent Y", "C parent Y"
    ).relations_of("X")

    (sibling,) = [r for r in relations if r.person == "Y"]
    assert sibling.relation == R.HALF_SIBLING
    assert sibling.direct_link == "link0"


def test_results_are_ordered_by_relation_then_person():
    relations = graph(*ELA).relations_of("Ela")

    order = list(Relation)
    keys = [(order.index(r.relation), str(r.person)) for r in relations]
    assert keys == sorted(keys)
