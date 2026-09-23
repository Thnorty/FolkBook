"""What each user can change."""

import pytest

from access.policy import (
    Access,
    can_add_person_to_space,
    can_change_space_people,
    can_create_relationship,
    can_delete_person,
    can_edit_person,
    can_edit_relationship,
    can_manage_space,
    can_write_private,
)


def access(world, who: str) -> Access:
    return Access.for_user(getattr(world, who))


def person(world, name: str):
    """A person by attribute name, or someone's Me as "<user>.me"."""
    if name.endswith(".me"):
        return getattr(world, name.removesuffix(".me")).me
    return getattr(world, name)


@pytest.mark.parametrize(
    ("who", "target", "allowed"),
    [
        ("ela", "oskar", True),  # owner
        ("deniz", "oskar", True),  # editor of Climbing club, which Oskar is in
        ("kaan", "oskar", False),  # viewer
        ("sofia", "oskar", False),  # can't see Oskar
        ("deniz", "emma", False),  # Emma isn't in Climbing club
        ("ela", "tom", False),  # viewer in Hackathon 2026
        ("ela", "ela.me", True),  # your own Me
        ("ela", "deniz.me", False),  # nobody else's Me
        ("deniz", "ela.me", False),
    ],
)
def test_can_edit_person(world, who, target, allowed):
    assert can_edit_person(access(world, who), person(world, target)) == allowed


def test_editors_cannot_edit_a_me_even_if_it_was_added_to_their_space(world):
    world.climbing.people.add(world.kaan.me)

    assert not can_edit_person(access(world, "deniz"), world.kaan.me)


def test_editors_can_fix_basic_details_of_people_in_their_space(world):
    world.hackathon.memberships.filter(user=world.ela).update(role="editor")

    assert can_edit_person(access(world, "ela"), world.tom)
    assert not can_edit_person(access(world, "ela"), world.defne.me)


@pytest.mark.parametrize(
    ("who", "target", "allowed"),
    [
        ("ela", "oskar", True),
        ("deniz", "oskar", False),  # editors can't delete someone else's person
        ("defne", "jin", True),
        ("ela", "jin", False),
        ("ela", "ela.me", False),  # a Me goes away with the account, not on its own
    ],
)
def test_can_delete_person(world, who, target, allowed):
    assert can_delete_person(access(world, who), person(world, target)) == allowed


@pytest.mark.parametrize(
    ("who", "space", "manage", "change_people"),
    [
        ("ela", "climbing", True, True),
        ("deniz", "climbing", False, True),
        ("kaan", "climbing", False, False),
        ("sofia", "climbing", False, False),
        ("ela", "hackathon", False, False),
        ("defne", "hackathon", True, True),
    ],
)
def test_space_permissions(world, who, space, manage, change_people):
    a, s = access(world, who), getattr(world, space)

    assert can_manage_space(a, s) == manage
    assert can_change_space_people(a, s) == change_people


@pytest.mark.parametrize(
    ("who", "target", "space", "allowed"),
    [
        ("ela", "emma", "climbing", True),
        ("deniz", "yuki", "climbing", True),  # Deniz takes part in Climbing club
        ("defne", "jin", "hackathon", True),
        ("kaan", "oskar", "climbing", False),  # viewer
        # Tom belongs to Defne, who isn't in Climbing club: Ela can't pass him on.
        ("ela", "tom", "climbing", False),
        ("ela", "jin", "climbing", False),  # can't even see Jin
        ("ela", "deniz.me", "climbing", False),  # a Me is never added
        ("ela", "emma", "hackathon", False),  # viewer in Hackathon 2026
    ],
)
def test_can_add_person_to_space(world, who, target, space, allowed):
    result = can_add_person_to_space(
        access(world, who), person(world, target), getattr(world, space)
    )

    assert result == allowed


@pytest.mark.parametrize(
    ("who", "a", "b", "space", "allowed"),
    [
        ("ela", "emma", "tom", None, True),  # private link between people Ela sees
        ("ela", "oskar", "ines", "climbing", True),
        ("ela", "oskar", "deniz.me", "climbing", True),  # members' Me are in the space
        ("ela", "oskar", "emma", "climbing", False),  # Emma isn't in Climbing club
        ("ela", "tom", "ola", "hackathon", False),  # viewer
        ("deniz", "oskar", "ines", "climbing", True),
        ("deniz", "oskar", "yuki", None, True),
        ("kaan", "oskar", "ines", "climbing", False),
        ("kaan", "oskar", "ines", None, True),  # a private link of Kaan's own
        ("sofia", "oskar", "ines", None, False),  # can't see them
    ],
)
def test_can_create_relationship(world, who, a, b, space, allowed):
    result = can_create_relationship(
        access(world, who),
        person(world, a),
        person(world, b),
        getattr(world, space) if space else None,
    )

    assert result == allowed


@pytest.mark.parametrize(
    ("who", "link", "allowed"),
    [
        ("ela", "oskar_ines", True),
        ("deniz", "oskar_ines", False),  # only the link's owner
        ("defne", "tom_ola", True),
        ("ela", "tom_ola", False),
        ("ela", "tom_jin_private", False),
    ],
)
def test_can_edit_relationship(world, who, link, allowed):
    assert can_edit_relationship(access(world, who), getattr(world, link)) == allowed


@pytest.mark.parametrize(
    ("who", "target", "allowed"),
    [
        ("ela", "oskar", True),
        ("kaan", "oskar", True),  # viewers keep their own private notes
        ("sofia", "oskar", False),
        ("ela", "jin", False),
    ],
)
def test_can_write_private(world, who, target, allowed):
    assert can_write_private(access(world, who), person(world, target)) == allowed
