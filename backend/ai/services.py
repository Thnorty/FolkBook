"""Which AI Quick capture uses, saving it (your own, or the server's for admins), and
checking it: Fetch models and Test connection."""

import time
from urllib.parse import urlsplit

from django.core.exceptions import PermissionDenied, ValidationError

from accounts.models import User
from ai.client import GEMINI_BASE_URL, AiError, Target, chat, list_models
from ai.models import AiProvider
from ai.schemas import AiCheckIn, AiProviderIn
from core.secrets import seal, unseal


def provider_for(user: User) -> AiProvider | None:
    """Your own AI, else the server's, else none (AI is off)."""
    return _own(user) or _server()


def ai_settings(user: User) -> dict:
    mine, server = _own(user), _server()
    return {
        "mine": _out(mine),
        "server": _out(server),
        "using": "mine" if mine else "server" if server else None,
        "can_manage_server": user.is_staff,
    }


def save_provider(user: User, data: AiProviderIn, *, server: bool) -> AiProvider:
    _check_may_change(user, server)
    model = data.model.strip()
    base_url = data.base_url.strip() if data.provider == AiProvider.Kind.OPENAI_COMPATIBLE else ""
    if not model:
        raise ValidationError({"model": "Pick a model."})
    if data.provider == AiProvider.Kind.OPENAI_COMPATIBLE and not _is_http(base_url):
        raise ValidationError({"base_url": "Use the server's address, starting with http://"})

    row = _server() if server else _own(user)
    row = row or AiProvider(user=None if server else user, for_server=server)
    row.provider, row.base_url, row.model = data.provider, base_url, model
    if data.key is not None:
        key = data.key.strip()
        row.key = seal(key) if key else ""
    if server:
        row.set_by = user
    row.save()
    return row


def remove_provider(user: User, *, server: bool) -> None:
    _check_may_change(user, server)
    AiProvider.objects.filter(**({"for_server": True} if server else {"user": user})).delete()


def target_for_check(user: User, data: AiCheckIn) -> Target:
    """Where Fetch models and Test connection send their request: what's in the form.

    With `saved` and no key typed, the stored key. Your own goes to the address in the form
    (so a changed address can be tested before saving). The server's (admins only) stays at
    its stored address, so it can't be sent anywhere else.
    """
    base = GEMINI_BASE_URL if data.provider == AiProvider.Kind.GEMINI else data.base_url.strip()
    if data.key is None and data.saved is not None:
        _check_may_change(user, data.saved == "server")
        row = _server() if data.saved == "server" else _own(user)
        if row is not None and data.saved == "server":
            return Target.of(row, model=data.model.strip() or None)
        if row is not None:
            return Target(base, key_of(row) or "", data.model.strip() or row.model)
    return Target(base, (data.key or "").strip(), data.model.strip())


def test_connection(target: Target) -> dict:
    """A one-word question: did the AI answer, and how fast?"""
    started = time.monotonic()
    try:
        chat(target, [{"role": "user", "content": "Reply with the single word: ok"}], timeout=30)
    except AiError as error:
        return {"ok": False, "message": error.message, "millis": None}
    millis = round((time.monotonic() - started) * 1000)
    took = f"{millis} ms" if millis < 1000 else f"{millis / 1000:.1f} s"
    return {
        "ok": True,
        "message": f"Connected · {target.model} answered in {took}",
        "millis": millis,
    }


def fetch_models(target: Target) -> dict:
    try:
        return {"models": list_models(target), "message": None}
    except AiError as error:
        return {"models": [], "message": error.message}


def key_of(row: AiProvider) -> str | None:
    """The key in plain text, "" without one, None when it can't be read anymore."""
    return unseal(row.key) if row.key else ""


def _own(user: User) -> AiProvider | None:
    return AiProvider.objects.filter(user=user).first()


def _server() -> AiProvider | None:
    return AiProvider.objects.filter(for_server=True).select_related("set_by__me").first()


def _check_may_change(user: User, server: bool) -> None:
    if server and not user.is_staff:
        raise PermissionDenied("Only admins can set the server's AI.")


def _is_http(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme in {"http", "https"} and bool(parts.hostname)


def _out(row: AiProvider | None) -> dict | None:
    if row is None:
        return None
    key = key_of(row)
    return {
        "provider": row.provider,
        "base_url": row.base_url,
        "model": row.model,
        "key_hint": key[-4:] if key else None,
        "key_unreadable": key is None,
        "set_by": row.set_by.display_name if row.for_server and row.set_by else None,
        "updated_at": row.updated_at,
    }
