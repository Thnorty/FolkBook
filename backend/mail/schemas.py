from datetime import datetime
from typing import Literal

from ninja import Field, Schema

Security = Literal["starttls", "ssl", "none"]


class SmtpIn(Schema):
    host: str = Field(max_length=253)
    port: int = Field(587, ge=1, le=65535)
    security: Security = "starttls"
    username: str = Field("", max_length=254)
    # Left out: keep the saved password. "": no password (some relays need none).
    password: str | None = Field(None, max_length=1000)
    from_address: str = Field(max_length=320)


class SmtpOut(Schema):
    host: str
    port: int
    security: Security
    username: str
    has_password: bool  # never the password, nor any part of it
    password_unreadable: bool  # saved, but sealed under an older server secret
    from_address: str
    set_by: str | None
    updated_at: datetime | None


class MailSettingsOut(Schema):
    """The server's email settings, for admins."""

    ready: bool
    # "environment": FOLKBOOK_SMTP_* set them (read-only here); "saved": an admin did.
    source: Literal["environment", "saved"] | None
    smtp: SmtpOut | None
    links_to: str  # where links in emails lead (FOLKBOOK_URL)
    send_to: str  # where Send test email goes: the admin's own address


class MailStatusOut(Schema):
    ready: bool  # the server can send email


class MailTestIn(Schema):
    smtp: SmtpIn | None = None  # None: test the settings in use


class MailTestOut(Schema):
    ok: bool
    message: str
