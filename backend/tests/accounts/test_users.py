import pytest
from django.contrib.auth import authenticate
from django.db import IntegrityError

from accounts.admin import UserCreationForm
from accounts.models import User
from people.models import Person

pytestmark = pytest.mark.django_db

PASSWORD = "a long enough passphrase"


def test_create_user_also_creates_their_me_person():
    user = User.objects.create_user("ela@example.com", PASSWORD, name="Ela Demir")

    me = user.me
    assert me.name == "Ela Demir"
    assert me.owner == user
    assert me.is_me
    assert not user.is_staff
    assert not user.is_superuser


def test_me_person_name_defaults_to_the_email_name():
    user = User.objects.create_user("defne@example.com", PASSWORD)

    assert user.me.name == "defne"


def test_email_is_stored_lowercase_and_login_ignores_case():
    user = User.objects.create_user("Ela@Example.COM", PASSWORD)

    assert user.email == "ela@example.com"
    assert authenticate(username="ELA@example.com", password=PASSWORD) == user


def test_emails_are_unique_regardless_of_case():
    User.objects.create_user("ela@example.com", PASSWORD)

    with pytest.raises(IntegrityError):
        User.objects.create(email="ELA@example.com")


def test_create_user_requires_an_email():
    with pytest.raises(ValueError):
        User.objects.create_user("", PASSWORD)


def test_create_superuser_is_a_server_admin_with_a_me_person():
    admin = User.objects.create_superuser("admin@example.com", PASSWORD)

    assert admin.is_staff
    assert admin.is_superuser
    assert admin.me.owner == admin


def test_nothing_is_saved_when_creating_the_me_person_fails(monkeypatch):
    def fail(user, name):
        raise RuntimeError("boom")

    monkeypatch.setattr("people.services.create_me_person", fail)

    with pytest.raises(RuntimeError):
        User.objects.create_user("ela@example.com", PASSWORD)

    assert not User.objects.exists()


def test_admin_creation_form_creates_the_me_person():
    form = UserCreationForm(
        data={
            "email": "deniz@example.com",
            "name": "Deniz Arslan",
            "password1": PASSWORD,
            "password2": PASSWORD,
        }
    )
    assert form.is_valid(), form.errors

    user = form.save()

    assert user.me.name == "Deniz Arslan"
    assert user.check_password(PASSWORD)


def test_deleting_a_user_deletes_their_people():
    user = User.objects.create_user("ela@example.com", PASSWORD)
    Person.objects.create(owner=user, name="Emma Yılmaz")

    user.delete()

    assert not Person.objects.exists()
