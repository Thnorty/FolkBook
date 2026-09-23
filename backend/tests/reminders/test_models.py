import pytest
from django.db import IntegrityError

from tests.factories import KeepInTouchFactory, UserFactory

pytestmark = pytest.mark.django_db


def test_one_keep_in_touch_setting_per_user_and_person():
    setting = KeepInTouchFactory()

    with pytest.raises(IntegrityError):
        KeepInTouchFactory(person=setting.person, user=setting.user)


def test_each_user_has_their_own_setting_for_a_shared_person():
    setting = KeepInTouchFactory(interval_days=60)

    KeepInTouchFactory(person=setting.person, user=UserFactory(), interval_days=30)


def test_interval_must_be_at_least_a_day():
    with pytest.raises(IntegrityError):
        KeepInTouchFactory(interval_days=0)


def test_no_interval_means_the_default_applies():
    assert KeepInTouchFactory().interval_days is None
