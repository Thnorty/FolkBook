"""The family tree walk, table-driven on plain data (no database).

Links are written as short strings (see `specs.py`).
"""

import pytest

from relationships.tree import TreePerson, walk
from tests.relationships.specs import links
from tests.relationships.test_family import ELA

F, T = False, True


def summary(people: list[TreePerson]) -> dict:
    """Each person's (generation, in_law, via_former)."""
    return {p.person: (p.generation, p.in_law, p.via_former) for p in people}


def test_elas_tree():
    assert summary(walk(links(*ELA), "Ela")) == {
        "Orhan": (2, F, F),
        "Leyla": (2, F, F),
        "Murat": (1, F, F),
        "Nilgün": (1, F, F),
        "Hakan": (1, F, F),  # step-father: a stored step-parent link
        "Selim": (1, F, F),  # Murat's sibling, linked directly
        "Sevgi": (1, F, F),  # Nilgün's sibling, linked directly
        "Kemal": (1, T, F),  # Sevgi's partner
        "Rosa": (1, T, F),  # Mateo's mother
        "Ela": (0, F, F),
        "Can": (0, F, F),
        "Aylin": (0, F, F),  # cousin, through Selim
        "Mateo": (0, F, F),  # Ela's own partner
        "Zeynep": (0, T, F),  # Can's partner
        "Diego": (0, T, F),  # Mateo's sibling
        "Emir": (-1, F, F),
        "Lina": (-1, F, F),
    }


@pytest.mark.parametrize(
    ("specs", "expected"),
    [
        pytest.param(
            ["M parent R", "S partner M", "S parent X"],
            {"R": (0, F, F), "M": (1, F, F), "S": (1, F, F), "X": (0, F, F)},
            id="a step-parent's child is a step-sibling, not an in-law",
        ),
        pytest.param(
            ["M parent R", "M parent B", "B parent K", "W parent K", "V parent W"],
            {"R": (0, F, F), "M": (1, F, F), "B": (0, F, F), "K": (-1, F, F), "W": (0, T, F)},
            id="a nephew's other parent is an in-law, without their family",
        ),
        pytest.param(
            ["R partner P", "P parent S", "S partner T"],
            {"R": (0, F, F), "P": (0, F, F), "S": (-1, F, F), "T": (-1, T, F)},
            id="a partner's child is a step-child, not an in-law",
        ),
        pytest.param(
            ["R partner P", "Q parent P", "Q partner Z", "Y parent Z"],
            {"R": (0, F, F), "P": (0, F, F), "Q": (1, T, F), "Z": (1, T, F)},
            id="in-laws stop after one partnership",
        ),
        pytest.param(
            ["M parent R", "M parent B", "B partner W", "V parent W"],
            {"R": (0, F, F), "M": (1, F, F), "B": (0, F, F), "W": (0, T, F)},
            id="a sibling's partner's family never comes in",
        ),
        pytest.param(
            ["R partner:former X", "Y parent X"],
            {"R": (0, F, F), "X": (0, F, T), "Y": (1, T, T)},
            id="an ex and their family are through a former partner",
        ),
        pytest.param(
            ["M parent R", "F parent R", "M partner:former F"],
            {"R": (0, F, F), "M": (1, F, F), "F": (1, F, F)},
            id="divorced parents are both plain family",
        ),
        pytest.param(
            ["M parent R", "S partner:former M"],
            {"R": (0, F, F), "M": (1, F, F), "S": (1, F, T)},
            id="a former step-parent is through a former partner",
        ),
        pytest.param(
            ["A parent B", "B parent C", "C parent D", "D parent R"],
            {"R": (0, F, F), "D": (1, F, F), "C": (2, F, F), "B": (3, F, F), "A": (4, F, F)},
            id="ancestors at any distance",
        ),
        pytest.param(
            ["G grandparent R", "A aunt_uncle R", "R aunt_uncle N", "R cousin C"],
            {"R": (0, F, F), "G": (2, F, F), "A": (1, F, F), "N": (-1, F, F), "C": (0, F, F)},
            id="direct links set generations",
        ),
        pytest.param(
            ["A aunt_uncle R", "G parent A", "A parent C"],
            {"R": (0, F, F), "A": (1, F, F), "G": (2, F, F), "C": (0, F, F)},
            id="a directly linked aunt's parents and children are family",
        ),
        pytest.param(
            ["G parent M", "G parent F", "M parent R", "F parent C", "R partner C"],
            {"R": (0, F, F), "G": (2, F, F), "M": (1, F, F), "F": (1, F, F), "C": (0, F, F)},
            id="cousins who married appear once, as family",
        ),
        pytest.param(
            ["X friend Y"],
            {"R": (0, F, F)},
            id="no family: only the root",
        ),
    ],
)
def test_who_is_in_the_tree(specs, expected):
    assert summary(walk(links(*specs), "R")) == expected


def test_a_loop_ends_with_everyone_once():
    people = walk(links("R parent B", "B parent R", "B partner R"), "R")
    assert sorted(p.person for p in people) == ["B", "R"]


def test_highest_generation_first():
    people = walk(links("M parent R", "R parent C", "R partner P"), "R")
    assert [p.person for p in people] == ["M", "P", "R", "C"]
