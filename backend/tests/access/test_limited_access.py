"""Narrowed access, as API keys will use: some spaces, no private notes, read-only."""

from access.policy import (
    Access,
    can_create_relationship,
    can_delete_person,
    can_edit_person,
    can_import,
    can_leave_space,
    can_write_private,
    visible_access_ended,
    visible_contact_methods,
    visible_notes,
    visible_people,
    visible_relationships,
    visible_spaces,
)
from people.models import AccessEnded


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


def test_access_ended_cards_are_private(world):
    AccessEnded.objects.create(user=world.ela, reason="removed", by="Defne", lost_count=2)

    assert visible_access_ended(Access.for_user(world.ela)).count() == 1
    assert not visible_access_ended(Access.limited(world.ela)).exists()
    assert not visible_access_ended(Access.for_user(world.deniz)).exists()


def test_read_only_access_can_change_nothing(world):
    key = Access.limited(world.ela, include_private=True)

    assert not can_edit_person(key, world.oskar)
    assert not can_delete_person(key, world.oskar)
    assert not can_write_private(key, world.oskar)
    assert not can_create_relationship(key, world.oskar, world.ines)
    assert not can_leave_space(key, world.hackathon)


def test_writable_limited_access_can_only_link_inside_its_spaces(world):
    key = Access.limited(world.ela, space_ids=[world.climbing.pk], read_only=False)

    assert can_create_relationship(key, world.oskar, world.ines, world.climbing)
    assert not can_create_relationship(key, world.oskar, world.ines)  # private link
    assert not can_edit_person(key, world.emma)  # out of scope


def test_all_spaces_read_only_access_sees_everything_the_user_sees(world):
    key = Access.limited(world.ela)

    assert set(visible_people(key)) == set(visible_people(Access.for_user(world.ela)))


def test_importing_contacts_needs_full_read_write_access(world):
    assert can_import(Access.for_user(world.ela))
    assert not can_import(Access.limited(world.ela, include_private=True, read_only=True))
    assert not can_import(Access.limited(world.ela, include_private=False, read_only=False))
    assert not can_import(
        Access.limited(
            world.ela, space_ids=[world.climbing.pk], include_private=True, read_only=False
        )
    )
