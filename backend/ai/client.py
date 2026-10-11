"""Talking to an AI: one OpenAI-compatible client for Gemini, OpenAI, Ollama, LM Studio…

Python's standard library only. Keys, prompts and replies are never logged; errors carry
a short message in FolkBook's own words, never what the provider sent back.
"""

import http.client
import json
import logging
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import urlsplit

from ai.models import AiProvider

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
CHAT_TIMEOUT = 90
MODELS_TIMEOUT = 15
LOCALHOST_HINT = (
    "Inside Docker, 'localhost' is FolkBook's own container. "
    "Use http://host.docker.internal:11434/v1 or your computer's network address."
)

logger = logging.getLogger("folkbook.ai")

# Only http(s), and never a redirect: a redirect would carry the key to wherever it points,
# so it's answered like any other error. (urllib's default opener also opens file:// and
# ftp:// addresses, and follows redirects with the Authorization header.)
_opener = urllib.request.OpenerDirector()
for _handler in (
    urllib.request.HTTPHandler(),
    urllib.request.HTTPSHandler(),
    urllib.request.HTTPDefaultErrorHandler(),
    urllib.request.HTTPErrorProcessor(),
    urllib.request.UnknownHandler(),  # any other scheme: an error, not a silent None
):
    _opener.add_handler(_handler)


@dataclass(frozen=True)
class Target:
    """Where to send a request: the server's address, the key ("" for none), the model."""

    base_url: str
    key: str
    model: str = ""

    @classmethod
    def of(cls, row: AiProvider, model: str | None = None) -> "Target":
        from ai.services import key_of  # services imports this module

        base = GEMINI_BASE_URL if row.provider == AiProvider.Kind.GEMINI else row.base_url
        return cls(base, key_of(row) or "", model or row.model)


class AiError(Exception):
    """What went wrong, as a kind (refused, no_model, unreachable, timeout, bad_answer,
    failed) and a message a person can act on."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind
        self.message = message


def chat(
    target: Target, messages: list[dict], schema: dict | None = None, timeout: float = CHAT_TIMEOUT
) -> str:
    """The AI's reply to `messages`. With a `schema`, ask for JSON in that shape (falling back
    to plain JSON mode for servers without structured output)."""
    body: dict = {"model": target.model, "messages": messages}
    if schema is not None:
        body["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": "capture", "schema": schema, "strict": True},
        }
    try:
        reply = _request(target, "POST", "chat/completions", body, timeout)
    except _Refused as refused:
        if schema is None or "response_format" not in refused.body:
            raise _as_error(refused, target, timeout) from None
        body["response_format"] = {"type": "json_object"}
        reply = _send(target, "POST", "chat/completions", body, timeout)
    try:
        return reply["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise AiError("bad_answer", "The answer didn't make sense.") from None


def list_models(target: Target, timeout: float = MODELS_TIMEOUT) -> list[str]:
    """The model ids the server offers, short ("models/gemini-2.5-flash" → "gemini-2.5-flash")."""
    reply = _send(target, "GET", "models", None, timeout)
    try:
        ids = {str(model["id"]).removeprefix("models/") for model in reply["data"]}
    except (KeyError, TypeError):
        raise AiError("bad_answer", "The answer didn't make sense.") from None
    return sorted(ids)


class _Refused(Exception):
    """An HTTP error, kept until we know whether to retry."""

    def __init__(self, status: int, body: str):
        self.status = status
        self.body = body


def _send(target: Target, method: str, path: str, body: dict | None, timeout: float) -> dict:
    try:
        return _request(target, method, path, body, timeout)
    except _Refused as refused:
        raise _as_error(refused, target, timeout) from None


def _request(target: Target, method: str, path: str, body: dict | None, timeout: float) -> dict:
    url = f"{target.base_url.rstrip('/')}/{path}"
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if target.key:
        headers["Authorization"] = f"Bearer {target.key}"
    data = json.dumps(body).encode() if body is not None else None
    host = urlsplit(target.base_url).hostname
    try:
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        with _opener.open(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        logger.info("AI %s %s answered %s", method, host, error.code)
        raise _Refused(error.code, error.read().decode(errors="replace")) from None
    except TimeoutError:
        logger.info("AI %s %s timed out", method, host)
        raise AiError("timeout", f"No answer in {_seconds(timeout)} seconds.") from None
    except urllib.error.URLError as error:
        if isinstance(error.reason, TimeoutError | socket.timeout):
            logger.info("AI %s %s timed out", method, host)
            raise AiError("timeout", f"No answer in {_seconds(timeout)} seconds.") from None
        logger.info("AI %s %s unreachable", method, host)
        raise AiError("unreachable", _unreachable(target.base_url)) from None
    except OSError:
        logger.info("AI %s %s unreachable", method, host)
        raise AiError("unreachable", _unreachable(target.base_url)) from None
    except http.client.HTTPException:
        # Something answered, but not in HTTP (a database, a mail server…).
        logger.info("AI %s %s answered without HTTP", method, host)
        raise AiError("bad_answer", "The answer didn't make sense.") from None
    except ValueError:
        # The address or the key can't go into a request; their text stays out of messages.
        logger.info("AI %s %s couldn't be asked", method, host)
        raise AiError("failed", "That address or key can't be used.") from None
    try:
        return json.loads(raw)
    except ValueError:
        raise AiError("bad_answer", "The answer didn't make sense.") from None


def _as_error(refused: _Refused, target: Target, timeout: float) -> AiError:
    if refused.status in (401, 403):
        return AiError("refused", "The key was refused.")
    if refused.status == 404:
        return AiError("no_model", "The model isn't there.")
    return AiError("failed", f"The AI answered with an error ({refused.status}).")


def _unreachable(base_url: str) -> str:
    message = f"Can't reach {base_url}"
    if urlsplit(base_url).hostname in {"localhost", "127.0.0.1", "::1"}:
        message += f". {LOCALHOST_HINT}"
    return message


def _seconds(timeout: float) -> str:
    return f"{timeout:g}"
