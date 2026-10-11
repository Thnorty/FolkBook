"""Which AI Quick capture uses, and saving it: someone's own, or the server's (admins)."""

from urllib.parse import urlsplit

from django.core.exceptions import PermissionDenied, ValidationError

from accounts.models import User
from ai.models import AiProvider
from ai.schemas import AiProviderIn
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
