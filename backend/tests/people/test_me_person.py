import pytest
from django.db import IntegrityError

from accounts.models import User
from people.models import Person
from tests.factories import PASSWORD

pytestmark = pytest.mark.django_db


def test_a_user_has_only_one_me_person():
    user = User.objects.create_user("ela@example.com", PASSWORD)

    with pytest.raises(IntegrityError):
        Person.objects.create(owner=user, account=user, name="Second me")


def test_a_me_person_must_be_owned_by_its_own_account():
    ela = User.objects.create_user("ela@example.com", PASSWORD)
    defne = User.objects.create_user("defne@example.com", PASSWORD)
    ela.me.delete()

    with pytest.raises(IntegrityError):
        Person.objects.create(owner=defne, account=ela, name="Ela")


def test_other_people_are_not_me():
    user = User.objects.create_user("ela@example.com", PASSWORD)

    emma = Person.objects.create(owner=user, name="Emma Yılmaz")

    assert not emma.is_me
    assert list(user.people.filter(account__isnull=True)) == [emma]
