"""family_of(): derived family from the links the viewer is allowed to see."""

import pytest

from access.policy import Access
from relationships.family import Relation, family_of
from tests.factories import (
    PersonFactory,
    RelationshipFactory,
    SpaceFactory,
    SpaceMembershipFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def family():
    """Ela's parents Murat and Nilgün and her brother Can, linked privately by Ela.

    The people are in her "Family" space, shared with Deniz.
    """
    ela, deniz = UserFactory(name="Ela"), UserFactory(name="Deniz")
    murat = PersonFactory(owner=ela, name="Murat")
    nilgun = PersonFactory(owner=ela, name="Nilgün")
    can = PersonFactory(owner=ela, name="Can")
    space = SpaceFactory(owner=ela, name="Family")
    space.people.add(murat, nilgun, can)
    SpaceMembershipFactory(space=space, user=deniz)
    links = [
        RelationshipFactory(
            owner=ela, person_a=parent, person_b=child, type="parent", parent_type="biological"
        )
        for parent in (murat, nilgun)
        for child in (ela.me, can)
    ]
    return {"ela": ela, "deniz": deniz, "can": can, "space": space, "links": links}


def relations(access, person):
    return {(str(r.person), r.relation) for r in family_of(access, person)}


def test_the_owner_sees_the_derived_family(family):
    ela = family["ela"]

    result = {(r.person, r.relation) for r in family_of(Access.for_user(ela), ela.me)}

    assert (family["can"], Relation.SIBLING) in result


def test_private_links_derive_nothing_for_other_users(family):
    deniz = Access.for_user(family["deniz"])

    assert relations(deniz, family["ela"].me) == set()


def test_links_in_a_shared_space_derive_the_family_for_its_members(family):
    for link in family["links"]:
        link.space = family["space"]
        link.save()

    deniz = Access.for_user(family["deniz"])

    assert relations(deniz, family["ela"].me) == {
        ("Murat", Relation.PARENT),
        ("Nilgün", Relation.PARENT),
        ("Can", Relation.SIBLING),
    }


def test_social_links_are_not_family(family):
    ela = family["ela"]
    RelationshipFactory(owner=ela, person_a=ela.me, person_b=PersonFactory(owner=ela))

    assert len(family_of(Access.for_user(ela), ela.me)) == 3


def test_family_of_takes_two_queries(family, django_assert_num_queries):
    ela = family["ela"]

    with django_assert_num_queries(2):
        family_of(Access.for_user(ela), ela.me)
