from datetime import datetime
from typing import Literal

from ninja import Schema

Provider = Literal["gemini", "openai_compatible"]


class AiProviderIn(Schema):
    provider: Provider
    base_url: str = ""
    model: str
    # Left out: keep the stored key. "": no key (local servers often need none).
    key: str | None = None


class AiProviderOut(Schema):
    provider: Provider
    base_url: str
    model: str
    key_hint: str | None  # the key's last four characters, never the key
    key_unreadable: bool  # stored, but sealed under an older server secret
    set_by: str | None
    updated_at: datetime


class AiSettingsOut(Schema):
    mine: AiProviderOut | None
    server: AiProviderOut | None
    using: Literal["mine", "server"] | None
    can_manage_server: bool


class AiCheckIn(Schema):
    """What the form holds, for Fetch models and Test connection (saved or not)."""

    provider: Provider
    base_url: str = ""
    model: str = ""
    key: str | None = None
    # Use the stored key of "mine" or "server" (admins) when the form has none.
    saved: Literal["mine", "server"] | None = None


class AiTestOut(Schema):
    ok: bool
    message: str
    millis: int | None


class AiModelsOut(Schema):
    models: list[str]
    message: str | None
