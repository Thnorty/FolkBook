import datetime

import pytest
from django.db import IntegrityError

from relationships.models import Relationship
from relationships.services import stored_order
from tests.factories import PersonFactory, RelationshipFactory, UserFactory

pytestmark = pytest.mark.django_db

Type = Relationship.Type


@pytest.fixture
def ela():
    return UserFactory()


@pytest.fixture
def pair(ela):
    """Two people in Ela's book, ordered so `first.pk < second.pk`."""
    first, second = sorted([PersonFactory(owner=ela), PersonFactory(owner=ela)], key=lambda p: p.pk)
    return first, second


def create(owner, a, b, **fields):
    """Create a link exactly as given, bypassing any ordering, to test the database rules."""
    return Relationship.objects.create(owner=owner, person_a=a, person_b=b, **fields)


@pytest.mark.parametrize(
    "fields",
    [
        {"type": Type.PARENT, "parent_type": "biological"},
        {"type": Type.PARENT, "parent_type": "adoptive"},
        {"type": Type.PARENT, "parent_type": "step"},
        {"type": Type.PARTNER},
        {"type": Type.PARTNER, "is_former": True, "ended_on": datetime.date(2026, 3, 1)},
        {"type": Type.PARTNER, "is_former": True},  # ended, date unknown
        {"type": Type.SIBLING},
        {"type": Type.COUSIN},
        {"type": Type.GRANDPARENT},
        {"type": Type.AUNT_UNCLE},
        {"type": Type.FRIEND},
        {"type": Type.COLLEAGUE, "started_on": datetime.date(2023, 1, 9)},
        {"type": Type.CLASSMATE},
        {"type": Type.MET_AT, "label": "Hackathon 2026"},
        {"type": Type.CUSTOM, "label": "Belay partner"},
    ],
)
def test_valid_links(ela, pair, fields):
    create(ela, *pair, **fields)


@pytest.mark.parametrize(
    ("fields", "reason"),
    [
        ({"type": Type.PARENT}, "parents need a parent type"),
        ({"type": Type.FRIEND, "parent_type": "step"}, "only parents have a parent type"),
        ({"type": Type.MET_AT}, "met at needs a label"),
        ({"type": Type.CUSTOM}, "custom needs a label"),
        (
            {"type": Type.PARENT, "parent_type": "biological", "is_former": True},
            "parent links never end",
        ),
        ({"type": Type.FRIEND, "ended_on": datetime.date(2026, 3, 1)}, "end date means former"),
    ],
)
def test_invalid_links_are_rejected(ela, pair, fields, reason):
    with pytest.raises(IntegrityError):
        create(ela, *pair, **fields)


def test_a_person_cannot_be_linked_to_themselves(ela, pair):
    with pytest.raises(IntegrityError):
        create(ela, pair[0], pair[0], type=Type.FRIEND)


@pytest.mark.parametrize("type", [Type.PARTNER, Type.SIBLING, Type.COUSIN, Type.FRIEND])
def test_symmetric_links_must_be_stored_lowest_id_first(ela, pair, type):
    first, second = pair

    with pytest.raises(IntegrityError):
        create(ela, second, first, type=type)


@pytest.mark.parametrize("type", [Type.GRANDPARENT, Type.AUNT_UNCLE])
def test_directional_links_can_point_either_way(ela, pair, type):
    first, second = pair

    create(ela, second, first, type=type)


def test_the_same_current_link_cannot_be_stored_twice(ela, pair):
    create(ela, *pair, type=Type.FRIEND)

    with pytest.raises(IntegrityError):
        create(ela, *pair, type=Type.FRIEND)


def test_a_former_partner_can_become_a_partner_again(ela, pair):
    create(ela, *pair, type=Type.PARTNER, is_former=True)

    create(ela, *pair, type=Type.PARTNER)


def test_two_users_can_record_the_same_link(pair):
    first, second = pair

    create(first.owner, first, second, type=Type.FRIEND)
    create(UserFactory(), first, second, type=Type.FRIEND)


@pytest.mark.parametrize("type", [Type.PARTNER, Type.COUSIN, Type.FRIEND, Type.MET_AT])
def test_stored_order_puts_the_lowest_id_first_for_symmetric_links(pair, type):
    first, second = pair

    assert stored_order(type, second, first) == (first, second)
    assert stored_order(type, first, second) == (first, second)


@pytest.mark.parametrize("type", [Type.PARENT, Type.GRANDPARENT, Type.AUNT_UNCLE])
def test_stored_order_keeps_the_direction_of_directional_links(pair, type):
    first, second = pair

    assert stored_order(type, second, first) == (second, first)


def test_family_types():
    family = {t for t in Type if Relationship(type=t).is_family}

    assert family == {
        Type.PARENT,
        Type.PARTNER,
        Type.SIBLING,
        Type.COUSIN,
        Type.GRANDPARENT,
        Type.AUNT_UNCLE,
    }


def test_factory_stores_symmetric_links_in_the_required_order():
    link = RelationshipFactory(type=Type.PARTNER)

    assert link.person_a.pk < link.person_b.pk
