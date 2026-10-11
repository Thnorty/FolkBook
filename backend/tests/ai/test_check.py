"""Fetch models and Test connection: plain answers, and the server's key stays put."""

import pytest

from ai.models import AiProvider
from core.secrets import seal

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin(world):
    world.ela.is_staff = True
    world.ela.save()
    return world.ela


def local(stub_ai, **extra):
    return {
        "provider": "openai_compatible",
        "base_url": stub_ai.url,
        "model": "llama3.1:8b",
        **extra,
    }


def test_test_connection_reports_how_long(api, world, stub_ai):
    stub_ai.chat_reply("ok")

    body = api.login(world.deniz).post("/ai/test", local(stub_ai)).json()

    assert body["ok"] is True
    assert body["message"].startswith("Connected · llama3.1:8b answered in ")
    assert body["message"].endswith(" ms")
    assert isinstance(body["millis"], int)


def test_test_connection_says_why_not(api, world, stub_ai):
    stub_ai.answer(401, {"error": "bad key"})

    body = api.login(world.deniz).post("/ai/test", local(stub_ai, key="sk-wrong")).json()

    assert body == {"ok": False, "message": "The key was refused.", "millis": None}


def test_fetch_models_with_the_saved_key(api, world, stub_ai):
    client = api.login(world.deniz)
    client.put("/ai/mine", local(stub_ai, key="sk-saved"))
    stub_ai.answer(200, {"data": [{"id": "llama3.1:8b"}, {"id": "qwen2.5:7b"}]})

    body = client.post("/ai/models", {**local(stub_ai), "saved": "mine"}).json()

    assert body == {"models": ["llama3.1:8b", "qwen2.5:7b"], "message": None}
    assert stub_ai.requests[0]["headers"]["Authorization"] == "Bearer sk-saved"


def test_a_saved_key_only_goes_to_its_own_address(api, world, stub_ai):
    # Changing the address asks for the key again, so a stored key can't be sent elsewhere.
    client = api.login(world.deniz)
    client.put("/ai/mine", local(stub_ai, key="sk-saved"))

    moved = {**local(stub_ai), "base_url": "http://elsewhere.invalid/v1", "saved": "mine"}
    body = client.post("/ai/test", moved).json()

    assert body == {
        "ok": False,
        "message": "Enter the key again to test a new address.",
        "millis": None,
    }
    models = client.post("/ai/models", moved).json()
    assert models == {"models": [], "message": "Enter the key again to test a new address."}
    assert stub_ai.requests == []


def test_without_a_saved_key_the_form_is_tested_as_typed(api, world, stub_ai):
    client = api.login(world.deniz)
    client.put("/ai/mine", {**local(stub_ai), "base_url": "http://old.invalid/v1"})
    stub_ai.chat_reply("ok")

    body = client.post("/ai/test", {**local(stub_ai), "saved": "mine"}).json()

    assert body["ok"] is True
    assert "Authorization" not in stub_ai.requests[0]["headers"]


@pytest.mark.parametrize(
    "base_url",
    ["file:///etc/passwd#", "ftp://files.example/v1", "", "http://ollama:abc/v1"],
)
def test_checks_only_take_http_addresses(api, world, stub_ai, base_url):
    client = api.login(world.deniz)
    for path in ("/ai/test", "/ai/models"):
        response = client.post(path, {**local(stub_ai), "base_url": base_url})
        assert response.status_code == 422


@pytest.mark.parametrize("base_url", ["http://ollama:11434/v1?x=1", "http://ollama:11434/v1#x"])
def test_addresses_have_no_query_or_fragment(api, world, stub_ai, base_url):
    client = api.login(world.deniz)
    assert client.put("/ai/mine", {**local(stub_ai), "base_url": base_url}).status_code == 422
    assert client.post("/ai/test", {**local(stub_ai), "base_url": base_url}).status_code == 422


def test_a_key_with_line_breaks_is_refused(api, world, stub_ai):
    client = api.login(world.deniz)
    bad = local(stub_ai, key="sk-ab\ncd")

    assert client.put("/ai/mine", bad).status_code == 422
    assert client.post("/ai/test", bad).status_code == 422
    assert stub_ai.requests == []


def test_fetch_models_says_why_not(api, world, stub_ai):
    stub_ai.answer(401, {"error": "bad key"})

    body = api.login(world.deniz).post("/ai/models", local(stub_ai, key="sk-wrong")).json()

    assert body == {"models": [], "message": "The key was refused."}


def test_only_admins_use_the_server_key(api, world, admin, stub_ai):
    AiProvider.objects.create(
        for_server=True,
        provider="openai_compatible",
        base_url=stub_ai.url,
        model="llama3.1:8b",
        key=seal("sk-server"),
        set_by=admin,
    )
    member = api.login(world.deniz)
    asking = {"provider": "openai_compatible", "base_url": stub_ai.url, "saved": "server"}
    assert member.post("/ai/test", asking).status_code == 403
    assert member.post("/ai/models", asking).status_code == 403
    assert stub_ai.requests == []

    # An admin testing the stored key reaches the stored address with it, and nowhere else.
    stub_ai.chat_reply("ok")
    admin_client = api.login(admin)
    body = admin_client.post("/ai/test", {**asking, "model": "llama3.1:8b"}).json()
    assert body["ok"] is True
    assert stub_ai.requests[0]["headers"]["Authorization"] == "Bearer sk-server"
    elsewhere = {**asking, "base_url": "http://elsewhere.invalid/v1"}
    assert admin_client.post("/ai/test", elsewhere).json()["message"] == (
        "Enter the key again to test a new address."
    )


def test_check_never_returns_the_reply(api, world, stub_ai):
    stub_ai.answer(500, {"error": "secret internal page"})

    response = api.login(world.deniz).post("/ai/test", local(stub_ai))

    assert response.json()["ok"] is False
    assert "secret" not in response.content.decode()
    assert "internal" not in response.content.decode()
