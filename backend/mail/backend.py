"""The mailer behind MAILERS["default"]: Django's SMTP backend, set up from the server's
email settings each time one is made (`mail.config`)."""

from django.core.mail.backends import smtp
from django.core.mail.handler import DEFAULT_MAILER_ALIAS

from mail.config import SmtpConfig, current

# Seconds to wait for the SMTP server before giving up.
TIMEOUT = 15


class EmailNotSetUp(Exception):
    """There's no SMTP server to send through."""


class EmailBackend(smtp.EmailBackend):
    def __init__(
        self, *, config: SmtpConfig | None = None, alias: str = DEFAULT_MAILER_ALIAS, **options
    ):
        """`config`: send through these settings instead (Send test email)."""
        config = config or current()
        if config is None:
            raise EmailNotSetUp
        super().__init__(alias=alias, timeout=TIMEOUT, **config.backend_options(), **options)
