import json

import pytest

from ai.client import AiError, Target, chat, list_models
from tests.ai.stub import closed_port

HELLO = [{"role": "user", "content": "hello"}]
LOCALHOST_HINT = (
    "Inside Docker, 'localhost' is FolkBook's own container. "
    "Use http://host.docker.internal:11434/v1 or your computer's network address."
)


def test_chat_sends_the_messages_and_the_key(stub_ai):
    stub_ai.chat_reply("hi there")

    answer = chat(Target(stub_ai.url, "sk-1", "llama3.1:8b"), HELLO)

    assert answer == "hi there"
    (request,) = stub_ai.requests
    assert (request["method"], request["path"]) == ("POST", "/v1/chat/completions")
    assert request["headers"]["Authorization"] == "Bearer sk-1"
    assert request["json"]["model"] == "llama3.1:8b"
    assert request["json"]["messages"] == HELLO


def test_no_key_no_header(stub_ai):
    stub_ai.chat_reply("hi")

    chat(Target(stub_ai.url, "", "llama3.1:8b"), HELLO)

    assert "Authorization" not in stub_ai.requests[0]["headers"]


@pytest.mark.parametrize("ending", ["", "/"])
def test_trailing_slash_or_not(stub_ai, ending):
    stub_ai.chat_reply("hi")

    chat(Target(stub_ai.url + ending, "", "m"), HELLO)

    assert stub_ai.requests[0]["path"] == "/v1/chat/completions"


def test_structured_output_falls_back_to_json_mode(stub_ai):
    stub_ai.answer(400, {"error": {"message": "response_format json_schema is not supported"}})
    stub_ai.chat_reply('{"people": []}')
    schema = {"type": "object", "properties": {"people": {"type": "array"}}}

    answer = chat(Target(stub_ai.url, "", "m"), HELLO, schema=schema)

    assert json.loads(answer) == {"people": []}
    first, second = stub_ai.requests
    assert first["json"]["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "capture", "schema": schema, "strict": True},
    }
    assert second["json"]["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize(
    ("status", "body", "kind", "message"),
    [
        (401, {"error": "bad key"}, "refused", "The key was refused."),
        (403, {"error": "forbidden"}, "refused", "The key was refused."),
        (404, {"error": "no such model"}, "no_model", "The model isn't there."),
        (500, {"error": "oops"}, "failed", "The AI answered with an error (500)."),
        (200, "nonsense", "bad_answer", "The answer didn't make sense."),
    ],
)
def test_errors_have_kinds(stub_ai, status, body, kind, message):
    stub_ai.answer(status, body)

    with pytest.raises(AiError) as caught:
        chat(Target(stub_ai.url, "k", "m"), HELLO)

    assert (caught.value.kind, caught.value.message) == (kind, message)


def test_an_unreachable_server():
    url = "http://folkbook-nowhere.invalid/v1"  # .invalid never resolves

    with pytest.raises(AiError) as caught:
        chat(Target(url, "", "m"), HELLO)

    assert caught.value.kind == "unreachable"
    assert caught.value.message == f"Can't reach {url}"


def test_a_slow_answer_times_out(stub_ai):
    stub_ai.delay = 1
    stub_ai.chat_reply("late")

    with pytest.raises(AiError) as caught:
        chat(Target(stub_ai.url, "", "m"), HELLO, timeout=0.2)

    assert caught.value.kind == "timeout"


def test_localhost_gets_the_docker_hint():
    url = f"http://localhost:{closed_port()}/v1"

    with pytest.raises(AiError) as caught:
        chat(Target(url, "", "m"), HELLO)

    assert caught.value.message == f"Can't reach {url}. {LOCALHOST_HINT}"


def test_models_are_listed_by_their_short_names(stub_ai):
    stub_ai.answer(
        200,
        {
            "data": [
                {"id": "models/gemini-2.5-pro"},
                {"id": "models/gemini-2.5-flash"},
                {"id": "models/gemini-2.5-flash"},
            ]
        },
    )

    assert list_models(Target(stub_ai.url, "k")) == ["gemini-2.5-flash", "gemini-2.5-pro"]
    assert stub_ai.requests[0]["path"] == "/v1/models"
