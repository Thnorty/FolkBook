"""What each user can see. Each test states the complete expected set, so any leak fails."""

import pytest

from access.policy import (
    Access,
    space_role,
    visible_contact_methods,
    visible_interactions,
    visible_keep_in_touch,
    visible_memory_aids,
    visible_notes,
    visible_people,
    visible_relationships,
    visible_spaces,
)
from tests.factories import RelationshipFactory


def names(queryset) -> set[str]:
    return {str(item) for item in queryset}


def access(world, who: str) -> Access:
    return Access.for_user(getattr(world, who))


@pytest.mark.parametrize(
    ("who", "expected"),
    [
        # Own book + Climbing club members' Me + Hackathon people and Defne's Me.
        ("ela", {"Ela", "Emma", "Oskar", "Ines", "Deniz", "Kaan", "Tom", "Ola", "Defne"}),
        ("deniz", {"Deniz", "Yuki", "Oskar", "Ines", "Ela", "Kaan"}),
        ("kaan", {"Kaan", "Oskar", "Ines", "Ela", "Deniz"}),
        ("defne", {"Defne", "Tom", "Ola", "Jin", "Ela"}),
        ("sofia", {"Sofia"}),
    ],
)
def test_visible_people(world, who, expected):
    assert names(visible_people(access(world, who))) == expected


@pytest.mark.parametrize(
    ("who", "expected"),
    [
        ("ela", {"Climbing club", "Hackathon 2026"}),
        ("deniz", {"Climbing club"}),
        ("kaan", {"Climbing club"}),
        ("defne", {"Hackathon 2026"}),
        ("sofia", set()),
    ],
)
def test_visible_spaces(world, who, expected):
    assert names(visible_spaces(access(world, who))) == expected


@pytest.mark.parametrize(
    ("who", "space", "expected"),
    [
        ("ela", "climbing", "owner"),
        ("ela", "hackathon", "viewer"),
        ("deniz", "climbing", "editor"),
        ("kaan", "climbing", "viewer"),
        ("sofia", "climbing", None),
        ("deniz", "hackathon", None),
    ],
)
def test_space_roles(world, who, space, expected):
    assert space_role(access(world, who), getattr(world, space)) == expected


@pytest.mark.parametrize(
    ("who", "expected"),
    [
        (
            "ela",
            {"emma_oskar_private", "oskar_ines", "oskar_emma_in_climbing", "tom_ola"},
        ),
        # Emma isn't in Climbing club, so members don't see the link to her.
        ("deniz", {"oskar_ines"}),
        ("kaan", {"oskar_ines"}),
        ("defne", {"tom_ola", "tom_jin_private"}),
        ("sofia", set()),
    ],
)
def test_visible_relationships(world, who, expected):
    expected_ids = {getattr(world, name).pk for name in expected}

    visible = visible_relationships(access(world, who))

    assert set(visible.values_list("pk", flat=True)) == expected_ids


def test_seeing_both_people_is_not_enough_to_see_a_link(world):
    # Ela sees Tom and Ola, but Defne's private link between them stays Defne's.
    private = RelationshipFactory(
        owner=world.defne, person_a=world.tom, person_b=world.ola, type="cousin"
    )

    visible = visible_relationships(access(world, "ela"))

    assert private not in visible
    assert world.tom_ola in visible


@pytest.mark.parametrize(
    ("who", "expected_authors"),
    [
        ("ela", {"ela"}),
        ("deniz", {"deniz"}),
        ("kaan", set()),
        ("defne", {"defne"}),
        ("sofia", set()),
    ],
)
def test_notes_are_only_ever_the_users_own(world, who, expected_authors):
    notes = visible_notes(access(world, who))

    assert {note.author for note in notes} == {getattr(world, a) for a in expected_authors}


@pytest.mark.parametrize(
    "visible", [visible_memory_aids, visible_interactions, visible_keep_in_touch]
)
@pytest.mark.parametrize(("who", "count"), [("ela", 1), ("deniz", 0), ("kaan", 0), ("sofia", 0)])
def test_other_private_data_is_only_ever_the_users_own(world, visible, who, count):
    assert visible(access(world, who)).count() == count


def test_private_data_about_someone_no_longer_visible_is_hidden(world):
    world.climbing.memberships.filter(user=world.deniz).delete()

    assert not visible_notes(access(world, "deniz")).exists()


@pytest.mark.parametrize(
    ("who", "sees_phone"),
    [("ela", True), ("deniz", False), ("kaan", False), ("defne", False), ("sofia", False)],
)
def test_contact_details_are_hidden_from_members_by_default(world, who, sees_phone):
    assert visible_contact_methods(access(world, who)).exists() == sees_phone


@pytest.mark.parametrize(
    ("who", "sees_phone"),
    [("ela", True), ("deniz", True), ("kaan", True), ("defne", False), ("sofia", False)],
)
def test_contact_details_are_shared_when_the_space_allows_it(world, who, sees_phone):
    world.climbing.share_contact_details = True
    world.climbing.save()

    assert visible_contact_methods(access(world, who)).exists() == sees_phone


def test_a_person_added_to_a_shared_space_becomes_visible_to_its_members(world):
    world.climbing.people.add(world.yuki, through_defaults={"added_by": world.deniz})

    assert world.yuki in visible_people(access(world, "ela"))
    assert world.yuki in visible_people(access(world, "kaan"))


def test_visible_people_is_a_single_query(world, django_assert_num_queries):
    with django_assert_num_queries(1):
        list(visible_people(access(world, "ela")))
