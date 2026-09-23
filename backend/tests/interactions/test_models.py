import datetime

import pytest
from django.db import IntegrityError

from tests.factories import InteractionFactory, PersonFactory

pytestmark = pytest.mark.django_db


def test_custom_interactions_need_a_label():
    with pytest.raises(IntegrityError):
        InteractionFactory(kind="custom", label="")


def test_custom_interaction_with_a_label():
    InteractionFactory(kind="custom", label="Birthday wishes")


def test_timeline_is_newest_first():
    emma = PersonFactory()
    older = InteractionFactory(person=emma, occurred_on=datetime.date(2026, 8, 2))
    newer = InteractionFactory(person=emma, occurred_on=datetime.date(2026, 9, 12))

    assert list(emma.interactions.all()) == [newer, older]
