import pytest
from django.contrib import admin
from django.urls import reverse

from accounts.models import User
from tests.factories import PASSWORD

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client(client):
    admin = User.objects.create_superuser("admin@example.com", PASSWORD)
    client.force_login(admin)
    return client


ADMIN_PAGES = [
    f"admin:{model._meta.app_label}_{model._meta.model_name}_{page}"
    for model in admin.site._registry
    for page in ("changelist", "add")
]


@pytest.mark.parametrize("url_name", ADMIN_PAGES)
def test_every_admin_list_and_add_page_renders(admin_client, url_name):
    response = admin_client.get(reverse(url_name))

    assert response.status_code == 200


def test_admin_user_and_person_change_pages_render(admin_client):
    admin = User.objects.get()

    user_page = admin_client.get(reverse("admin:accounts_user_change", args=[admin.pk]))
    person_page = admin_client.get(reverse("admin:people_person_change", args=[admin.me.pk]))

    assert user_page.status_code == 200
    assert person_page.status_code == 200


def test_adding_a_user_in_the_admin_creates_their_me_person(admin_client):
    response = admin_client.post(
        reverse("admin:accounts_user_add"),
        {
            "email": "deniz@example.com",
            "name": "Deniz Arslan",
            "password1": PASSWORD,
            "password2": PASSWORD,
            "usable_password": "true",
        },
    )

    assert response.status_code == 302
    deniz = User.objects.get(email="deniz@example.com")
    assert deniz.me.name == "Deniz Arslan"
    assert deniz.check_password(PASSWORD)


def test_admin_can_add_a_user_without_a_usable_password(admin_client):
    response = admin_client.post(
        reverse("admin:accounts_user_add"),
        {"email": "kaan@example.com", "name": "", "usable_password": "false"},
    )

    assert response.status_code == 302
    kaan = User.objects.get(email="kaan@example.com")
    assert not kaan.has_usable_password()
    assert kaan.me.name == "kaan"
