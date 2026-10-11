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

    # An admin can't send the stored key somewhere else: the stored address is used.
    stub_ai.chat_reply("ok")
    elsewhere = {**asking, "base_url": "http://elsewhere.invalid/v1", "model": "llama3.1:8b"}
    body = api.login(admin).post("/ai/test", elsewhere).json()
    assert body["ok"] is True
    assert stub_ai.requests[0]["headers"]["Authorization"] == "Bearer sk-server"


def test_check_never_returns_the_reply(api, world, stub_ai):
    stub_ai.answer(500, {"error": "secret internal page"})

    response = api.login(world.deniz).post("/ai/test", local(stub_ai))

    assert response.json()["ok"] is False
    assert "secret" not in response.content.decode()
    assert "internal" not in response.content.decode()
