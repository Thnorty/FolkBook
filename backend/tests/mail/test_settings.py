"""Settings → Email (SMTP): admins only, the environment wins, and never a password."""

import pytest

from access.policy import Access
from api_keys import services as api_key_services
from api_keys.schemas import ApiKeyIn
from core.secrets import unseal
from mail.models import SmtpSettings

pytestmark = pytest.mark.django_db

FASTMAIL = {
    "host": "smtp.fastmail.com",
    "port": 587,
    "security": "starttls",
    "username": "ela@fastmail.com",
    "password": "app-password-9d2k",
    "from_address": "FolkBook <folkbook@ela.home>",
}


@pytest.fixture
def admin(world):
    world.ela.is_staff = True
    world.ela.save()
    return world.ela


def test_email_is_not_set_up_at_first(api, admin, settings):
    settings.FOLKBOOK_URL = "https://folk.ela.home"

    assert api.get("/mail/status").json() == {"ready": False}  # open to anyone
    assert api.login(admin).get("/mail").json() == {
        "ready": False,
        "source": None,
        "smtp": None,
        "links_to": "https://folk.ela.home",
        "send_to": "ela@example.com",
    }


def test_only_admins_see_or_change_email(api, admin, world):
    member = api.login(world.deniz)

    assert member.get("/mail").status_code == 403
    assert member.put("/mail", FASTMAIL).status_code == 403
    assert member.delete("/mail").status_code == 403
    assert member.post("/mail/test", {}).status_code == 403
    assert not SmtpSettings.objects.exists()


def test_email_settings_need_the_login_cookie(api, admin):
    _, key = api_key_services.create_api_key(
        Access.for_user(admin), ApiKeyIn(name="Script", read_only=False)
    )

    assert api.with_key(key).put("/mail", FASTMAIL).status_code == 401


def test_saving_never_shows_the_password(api, admin):
    response = api.login(admin).put("/mail", FASTMAIL)

    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True
    assert body["source"] == "saved"
    assert body["smtp"]["has_password"] is True
    assert body["smtp"]["set_by"] == "Ela"
    assert "app-password" not in response.content.decode()
    assert "9d2k" not in response.content.decode()
    stored = SmtpSettings.objects.get()
    assert stored.password != FASTMAIL["password"]
    assert unseal(stored.password) == FASTMAIL["password"]
    assert api.get("/mail/status").json() == {"ready": True}


def test_saving_without_a_password_keeps_it(api, admin):
    client = api.login(admin)
    client.put("/mail", FASTMAIL)

    client.put("/mail", {**FASTMAIL, "port": 465, "security": "ssl", "password": None})

    stored = SmtpSettings.objects.get()
    assert (stored.port, stored.security) == (465, "ssl")
    assert unseal(stored.password) == FASTMAIL["password"]
    assert client.put("/mail", {**FASTMAIL, "password": ""}).json()["smtp"]["has_password"] is False


@pytest.mark.parametrize(
    "change", [{"host": "smtp.elsewhere.example"}, {"username": "someone@else.example"}]
)
def test_a_saved_password_never_goes_to_another_server(api, admin, change):
    client = api.login(admin)
    client.put("/mail", FASTMAIL)

    response = client.put("/mail", {**FASTMAIL, **change, "password": None})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "password"]
    assert SmtpSettings.objects.get().host == "smtp.fastmail.com"


@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"host": "smtp://smtp.fastmail.com"}, "host"),
        ({"host": "  "}, "host"),
        ({"from_address": "FolkBook"}, "from_address"),
        ({"from_address": "FolkBook <folkbook@ela.home>\nBcc: x@example.com"}, "from_address"),
        ({"port": 0}, "port"),
        ({"security": "tls"}, "security"),
    ],
)
def test_settings_are_checked(api, admin, change, field):
    response = api.login(admin).put("/mail", {**FASTMAIL, **change})

    assert response.status_code == 422
    assert field in str(response.json()["detail"])
    assert not SmtpSettings.objects.exists()


def test_a_bare_from_address_and_no_login_are_fine(api, admin):
    relay = {**FASTMAIL, "username": "", "password": "", "from_address": "folkbook@ela.home"}

    assert api.login(admin).put("/mail", relay).json()["ready"] is True


def test_removing_turns_email_off(api, admin):
    client = api.login(admin)
    client.put("/mail", FASTMAIL)

    assert client.delete("/mail").json()["ready"] is False
    assert not SmtpSettings.objects.exists()


def test_the_environment_wins(api, admin, email_ready):
    client = api.login(admin)

    body = client.get("/mail").json()

    assert body["source"] == "environment"
    assert body["ready"] is True
    assert body["smtp"]["host"] == "smtp.example.net"
    assert body["smtp"]["has_password"] is True
    assert "env-password" not in client.get("/mail").content.decode()
    assert client.put("/mail", FASTMAIL).status_code == 409
    assert client.delete("/mail").status_code == 409
    assert not SmtpSettings.objects.exists()


def test_a_password_from_an_old_secret_cannot_be_read(api, admin, settings):
    client = api.login(admin)
    client.put("/mail", FASTMAIL)

    settings.SECRET_KEY = "a-new-secret-after-a-reinstall"
    client = api.login(admin)  # the old session was signed with the old secret too

    body = client.get("/mail").json()
    assert body["smtp"]["password_unreadable"] is True
    assert body["ready"] is False
    assert client.put("/mail", {**FASTMAIL, "password": None}).status_code == 422
    assert client.put("/mail", FASTMAIL).json()["ready"] is True
