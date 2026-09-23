"""Narrowed access, as API keys will use: some spaces, no private notes, read-only."""

from access.policy import (
    Access,
    can_create_relationship,
    can_delete_person,
    can_edit_person,
    can_write_private,
    visible_contact_methods,
    visible_notes,
    visible_people,
    visible_relationships,
    visible_spaces,
)


def names(queryset) -> set[str]:
    return {str(item) for item in queryset}


def test_space_limited_access_only_sees_those_spaces(world):
    key = Access.limited(world.ela, space_ids=[world.climbing.pk])

    assert names(visible_spaces(key)) == {"Climbing club"}
    # Emma (in no space) and Hackathon people are out of scope.
    assert names(visible_people(key)) == {"Ela", "Oskar", "Ines", "Deniz", "Kaan"}
    assert set(visible_relationships(key)) == {world.oskar_ines}


def test_space_limited_access_still_sees_contact_details_of_own_people(world):
    key = Access.limited(world.ela, space_ids=[world.climbing.pk])

    assert visible_contact_methods(key).count() == 1


def test_private_notes_are_hidden_unless_allowed(world):
    without = Access.limited(world.ela)
    with_private = Access.limited(world.ela, include_private=True)

    assert not visible_notes(without).exists()
    assert visible_notes(with_private).count() == 1


def test_read_only_access_can_change_nothing(world):
    key = Access.limited(world.ela, include_private=True)

    assert not can_edit_person(key, world.oskar)
    assert not can_delete_person(key, world.oskar)
    assert not can_write_private(key, world.oskar)
    assert not can_create_relationship(key, world.oskar, world.ines)


def test_writable_limited_access_can_only_link_inside_its_spaces(world):
    key = Access.limited(world.ela, space_ids=[world.climbing.pk], read_only=False)

    assert can_create_relationship(key, world.oskar, world.ines, world.climbing)
    assert not can_create_relationship(key, world.oskar, world.ines)  # private link
    assert not can_edit_person(key, world.emma)  # out of scope


def test_all_spaces_read_only_access_sees_everything_the_user_sees(world):
    key = Access.limited(world.ela)

    assert set(visible_people(key)) == set(visible_people(Access.for_user(world.ela)))
