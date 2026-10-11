"""Settings → AI: your own provider, the server's, and what the API never gives back."""

import pytest

from access.policy import Access
from ai.models import AiProvider
from api_keys import services as api_key_services
from api_keys.schemas import ApiKeyIn
from core.secrets import unseal

pytestmark = pytest.mark.django_db

GEMINI = {"provider": "gemini", "model": "gemini-2.5-flash", "key": "AIzaSy-123-3f9a"}
LOCAL = {
    "provider": "openai_compatible",
    "base_url": "http://ollama:11434/v1",
    "model": "llama3.1:8b",
}


@pytest.fixture
def admin(world):
    world.ela.is_staff = True
    world.ela.save()
    return world.ela


def test_nobody_has_ai_at_first(api, world, admin):
    assert api.login(world.deniz).get("/ai").json() == {
        "mine": None,
        "server": None,
        "using": None,
        "can_manage_server": False,
    }
    assert api.login(admin).get("/ai").json()["can_manage_server"] is True


def test_saving_your_own_key_never_shows_it(api, world):
    response = api.login(world.deniz).put("/ai/mine", GEMINI)

    assert response.status_code == 200
    body = response.json()
    assert body["using"] == "mine"
    assert body["mine"]["key_hint"] == "3f9a"
    assert body["mine"]["key_unreadable"] is False
    assert "AIzaSy" not in response.content.decode()
    stored = AiProvider.objects.get(user=world.deniz)
    assert stored.key != GEMINI["key"]
    assert unseal(stored.key) == GEMINI["key"]


def test_saving_without_a_key_keeps_the_stored_one(api, world):
    client = api.login(world.deniz)
    client.put("/ai/mine", GEMINI)

    kept = client.put("/ai/mine", {"provider": "gemini", "model": "gemini-2.5-pro"}).json()
    assert kept["mine"]["key_hint"] == "3f9a"
    assert kept["mine"]["model"] == "gemini-2.5-pro"

    cleared = client.put("/ai/mine", {**GEMINI, "key": ""}).json()
    assert cleared["mine"]["key_hint"] is None


def test_a_local_server_needs_no_key_and_any_host(api, world):
    response = api.login(world.deniz).put("/ai/mine", LOCAL)

    assert response.status_code == 200
    assert response.json()["mine"]["base_url"] == "http://ollama:11434/v1"
    assert response.json()["mine"]["key_hint"] is None


@pytest.mark.parametrize("base_url", ["ftp://ollama:11434/v1", "", "http://"])
def test_base_url_must_be_http(api, world, base_url):
    response = api.login(world.deniz).put("/ai/mine", {**LOCAL, "base_url": base_url})

    assert response.status_code == 422


def test_a_model_is_needed(api, world):
    assert api.login(world.deniz).put("/ai/mine", {**GEMINI, "model": " "}).status_code == 422


def test_the_server_ai_is_for_admins_to_set(api, world, admin):
    member = api.login(world.deniz)
    assert member.put("/ai/server", GEMINI).status_code == 403
    assert member.delete("/ai/server").status_code == 403

    saved = api.login(admin).put("/ai/server", GEMINI)
    assert saved.status_code == 200

    seen = api.login(world.deniz).get("/ai")
    body = seen.json()
    assert body["using"] == "server"
    assert body["server"]["set_by"] == "Ela"
    assert body["server"]["key_hint"] == "3f9a"
    assert "AIzaSy" not in seen.content.decode()

    member = api.login(world.deniz)
    assert member.put("/ai/mine", LOCAL).json()["using"] == "mine"
    assert member.delete("/ai/mine").json()["using"] == "server"


def test_a_key_from_an_old_secret_cannot_be_read(api, world, settings):
    client = api.login(world.deniz)
    client.put("/ai/mine", GEMINI)

    settings.SECRET_KEY = "a-completely-different-secret-key"
    client = api.login(world.deniz)  # the old session was signed with the old secret too
    mine = client.get("/ai").json()["mine"]
    assert mine["key_unreadable"] is True
    assert mine["key_hint"] is None

    again = client.put("/ai/mine", GEMINI).json()["mine"]
    assert again["key_unreadable"] is False


def test_ai_settings_need_the_login_cookie(api, world):
    _, key = api_key_services.create_api_key(
        Access.for_user(world.deniz), ApiKeyIn(name="Script", expires_in="never")
    )

    assert api.with_key(key).get("/ai").status_code == 401
