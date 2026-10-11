"""Suggest: the AI's mentions, matched to the people you can see."""

import json

import pytest

from access.policy import Access
from ai.client import AiError
from ai.models import AiProvider
from api_keys import services as api_key_services
from api_keys.schemas import ApiKeyIn
from core.secrets import seal
from tests.ai.stub import closed_port
from tests.factories import PersonFactory

pytestmark = pytest.mark.django_db

TODAY = "2026-10-11"


def person(ref: str, name: str, **fields) -> dict:
    return {
        "ref": ref,
        "name": name,
        "how_we_met": None,
        "work": None,
        "birthday": None,
        "tags": [],
    } | fields


def reply(stub_ai, **parts) -> None:
    empty = {"people": [], "connections": [], "memory_aids": [], "entries": []}
    stub_ai.chat_reply(json.dumps(empty | parts))


def ai_for(user, url: str) -> AiProvider:
    return AiProvider.objects.create(
        user=user, provider="openai_compatible", base_url=url, model="test-model", key=seal("k")
    )


def suggest(api, user, **body):
    return api.login(user).post("/capture/suggest", {"text": "Met someone", "today": TODAY} | body)


@pytest.fixture
def ela_ai(world, stub_ai):
    return ai_for(world.ela, stub_ai.url)


def test_matches_names_to_your_people(api, world, stub_ai, ela_ai):
    world.emma.name = "Emma Yılmaz"
    world.emma.save()
    berg = PersonFactory(owner=world.ela, name="Emma Berg")
    reply(stub_ai, people=[person("e", "Emma"), person("m", "Mert"), person("y", "emma yilmaz")])

    response = suggest(api, world.ela)

    assert response.status_code == 200
    people = {p["ref"]: p for p in response.json()["people"]}
    assert people["e"]["match"] == "choose"
    assert [c["name"] for c in people["e"]["candidates"]] == ["Emma Berg", "Emma Yılmaz"]
    assert people["m"]["match"] == "new"
    assert people["m"]["candidates"] == []
    assert people["y"]["match"] == "match"
    assert [c["id"] for c in people["y"]["candidates"]] == [str(world.emma.pk)]
    assert str(berg.pk) not in [c["id"] for c in people["y"]["candidates"]]


def test_your_own_people_come_first(api, world, stub_ai, ela_ai):
    # Tom is Defne's, shared with Ela through Hackathon 2026; Ela has her own Tom too.
    own = PersonFactory(owner=world.ela, name="Tom")
    reply(stub_ai, people=[person("t", "Tom")])

    tom = suggest(api, world.ela).json()["people"][0]

    assert tom["match"] == "match"
    assert [c["id"] for c in tom["candidates"]] == [str(own.pk)]


def test_never_matches_someone_you_cannot_see(api, world, stub_ai, ela_ai):
    # Jin is in Defne's book only.
    reply(stub_ai, people=[person("j", "Jin")])

    response = suggest(api, world.ela)

    jin = response.json()["people"][0]
    assert (jin["match"], jin["candidates"]) == ("new", [])
    assert str(world.jin.pk) not in response.content.decode()


def test_candidates_say_what_you_may_change(api, world, stub_ai, ela_ai):
    world.emma.how_we_met, world.emma.work = "", "Google"
    world.emma.save()
    world.emma.tags.create(owner=world.ela, name="family")
    reply(stub_ai, people=[person("t", "Tom"), person("e", "Emma")])

    people = {p["ref"]: p for p in suggest(api, world.ela).json()["people"]}

    tom = people["t"]["candidates"][0]  # Defne's; Ela only views Hackathon 2026
    assert (tom["can_edit"], tom["can_tag"]) == (False, False)
    assert tom["owner"]["name"] == world.defne.me.name
    assert tom["detail"] == "Hackathon 2026"
    emma = people["e"]["candidates"][0]
    assert (emma["can_edit"], emma["can_tag"]) == (True, True)
    assert emma["current"] == {
        "how_we_met": "",
        "work": "Google",
        "birthday": None,
        "tags": ["family"],
    }
    assert emma["detail"] == "Google"


def test_candidates_say_whether_they_are_in_the_space(api, world, stub_ai, ela_ai):
    reply(
        stub_ai,
        people=[person("n", "Nil"), person("o", "Oskar"), person("e", "Emma")],
        connections=[
            {"a": "n", "b": "o", "type": "friend", "label": None},
            {"a": "me", "b": "o", "type": "parent", "label": None},
        ],
    )

    draft = suggest(api, world.ela, space_id=str(world.climbing.pk)).json()

    people = {p["ref"]: p for p in draft["people"]}
    assert people["o"]["candidates"][0]["in_space"] is True
    assert people["e"]["candidates"][0]["in_space"] is False
    assert draft["connections"] == [
        {"id": "c1", "a": "n", "b": "o", "type": "friend", "label": "", "parent_type": None},
        {
            "id": "c2",
            "a": "me",
            "b": "o",
            "type": "parent",
            "label": "",
            "parent_type": "biological",
        },
    ]


def test_a_space_you_cannot_add_to_is_refused(api, world, stub_ai, ela_ai):
    # Ela only views Hackathon 2026.
    response = suggest(api, world.ela, space_id=str(world.hackathon.pk))

    assert response.status_code == 422
    assert stub_ai.requests == []


def test_aids_and_entries_get_draft_ids(api, world, stub_ai, ela_ai):
    reply(
        stub_ai,
        people=[person("n", "Nil")],
        memory_aids=[{"about": "n", "text": "Likes climbing"}],
        entries=[
            {"about": "n", "kind": "met", "date": "2026-10-10", "label": None, "note": "Coffee"}
        ],
    )

    draft = suggest(api, world.ela).json()

    assert draft["memory_aids"] == [{"id": "m1", "about": "n", "text": "Likes climbing"}]
    assert draft["entries"] == [
        {
            "id": "e1",
            "about": "n",
            "kind": "met",
            "date": "2026-10-10",
            "label": "",
            "note": "Coffee",
        }
    ]


def test_no_ai_is_409(api, world):
    response = suggest(api, world.ela)

    assert response.status_code == 409
    assert response.json() == {"detail": "AI is off: add a key in Settings → AI."}


def test_the_servers_ai_is_used_without_your_own(api, world, stub_ai):
    AiProvider.objects.create(
        for_server=True, provider="openai_compatible", base_url=stub_ai.url, model="m"
    )
    reply(stub_ai)

    assert suggest(api, world.deniz).status_code == 200


def test_ai_errors_are_424(api, world, stub_ai, ela_ai):
    stub_ai.answer(401, {"error": "bad key"})
    refused = suggest(api, world.ela)
    assert refused.status_code == 424
    assert refused.json() == {"detail": "Your key was refused. Check Settings → AI."}

    stub_ai.chat_reply("not json")
    stub_ai.chat_reply("still not json")
    nonsense = suggest(api, world.ela)
    assert (nonsense.status_code, nonsense.json()["detail"]) == (
        424,
        "The AI's answer didn't make sense. Try again.",
    )

    ela_ai.base_url = f"http://127.0.0.1:{closed_port()}/v1"
    ela_ai.save()
    unreachable = suggest(api, world.ela)
    assert unreachable.status_code == 424
    assert unreachable.json()["detail"].startswith(f"Can't reach the AI at {ela_ai.base_url}. ")


def test_a_timeout_says_how_long_it_waited(api, world, ela_ai, monkeypatch):
    def too_slow(*args, **kwargs):
        raise AiError("timeout", "No answer in 90 seconds.")

    monkeypatch.setattr("capture.prompt.chat", too_slow)

    response = suggest(api, world.ela)

    assert response.status_code == 424
    assert response.json() == {"detail": "The AI didn't answer in time (90 s)."}


def test_a_key_that_cannot_be_read(api, world, stub_ai, ela_ai):
    ela_ai.key = "not-a-sealed-token"
    ela_ai.save()

    response = suggest(api, world.ela)

    assert response.status_code == 424
    assert response.json() == {
        "detail": "Your key can't be read anymore. Enter it again in Settings → AI."
    }
    assert stub_ai.requests == []


@pytest.mark.parametrize("text", ["", "   ", "x" * 4001], ids=["empty", "blank", "too long"])
def test_text_must_fit(api, world, stub_ai, ela_ai, text):
    assert suggest(api, world.ela, text=text).status_code == 422
    assert stub_ai.requests == []


def test_capture_takes_the_login_cookie_only(api, world):
    _, key = api_key_services.create_api_key(
        Access.for_user(world.ela), ApiKeyIn(name="Script", expires_in="never")
    )

    response = api.with_key(key).post("/capture/suggest", {"text": "Hi", "today": TODAY})

    assert response.status_code == 401


def test_dates_follow_the_devices_today(api, world, stub_ai, ela_ai):
    reply(stub_ai)

    suggest(api, world.ela, today="2026-01-02")

    sent = stub_ai.requests[0]["json"]["messages"][1]["content"]
    assert sent.startswith("Today is 2026-01-02.")
