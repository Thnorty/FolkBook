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
