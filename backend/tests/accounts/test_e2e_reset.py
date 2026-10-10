import pytest
from django.core.management import CommandError, call_command

from accounts.management.commands.e2e_reset import create_known_accounts
from accounts.models import User
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_refuses_a_database_not_named_for_end_to_end_tests():
    someone = UserFactory()

    # pytest's database is test_folkbook.
    with pytest.raises(CommandError, match="_e2e"):
        call_command("e2e_reset")

    assert User.objects.filter(pk=someone.pk).exists()


def test_makes_the_known_accounts_with_their_me():
    ela, deniz = create_known_accounts("e2e-pass-123")

    assert (ela.email, ela.display_name, ela.is_staff) == ("ela@e2e.test", "Ela Yılmaz", True)
    assert (deniz.email, deniz.display_name, deniz.is_staff) == (
        "deniz@e2e.test",
        "Deniz Kaya",
        False,
    )
    assert ela.check_password("e2e-pass-123")
    assert deniz.check_password("e2e-pass-123")
