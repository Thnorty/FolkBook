import pytest
from django.db import IntegrityError

from people.models import Person
from relationships.models import Relationship
from tests.factories import (
    PersonFactory,
    RelationshipFactory,
    SpaceFactory,
    SpaceMembershipFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def test_a_person_can_be_in_many_spaces():
    ela = UserFactory()
    tom = PersonFactory(owner=ela)
    work = SpaceFactory(owner=ela, name="Work")
    climbing = SpaceFactory(owner=ela, name="Climbing club")

    work.people.add(tom, through_defaults={"added_by": ela})
    climbing.people.add(tom, through_defaults={"added_by": ela})

    assert set(tom.spaces.all()) == {work, climbing}


def test_a_person_is_in_a_space_only_once():
    space = SpaceFactory()
    tom = PersonFactory(owner=space.owner)
    space.people.add(tom)

    with pytest.raises(IntegrityError):
        space.people.through.objects.create(space=space, person=tom)


def test_space_names_are_unique_per_owner_ignoring_case():
    ela = UserFactory()
    SpaceFactory(owner=ela, name="Family")

    with pytest.raises(IntegrityError):
        SpaceFactory(owner=ela, name="family")


def test_different_owners_can_use_the_same_space_name():
    SpaceFactory(name="Family")
    SpaceFactory(name="Family")


def test_spaces_are_private_and_hide_contact_details_by_default():
    space = SpaceFactory()

    assert not space.memberships.exists()
    assert not space.share_contact_details


def test_a_user_is_a_member_of_a_space_only_once():
    membership = SpaceMembershipFactory()

    with pytest.raises(IntegrityError):
        SpaceMembershipFactory(space=membership.space, user=membership.user)


def test_members_are_viewers_by_default():
    assert SpaceMembershipFactory().role == "viewer"


def test_deleting_a_space_keeps_its_people_and_their_links():
    space = SpaceFactory()
    tom = PersonFactory(owner=space.owner)
    space.people.add(tom)
    link = RelationshipFactory(owner=space.owner, person_a=tom, space=space)

    space.delete()

    assert Person.objects.filter(pk=tom.pk).exists()
    link.refresh_from_db()
    assert link.space is None
    assert Relationship.objects.count() == 1
