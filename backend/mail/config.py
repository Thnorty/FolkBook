"""Which SMTP server FolkBook sends through: the environment's (FOLKBOOK_SMTP_*), else
the one an admin saved in Settings → Email (SMTP), else none (email isn't set up)."""

from dataclasses import dataclass

from django.conf import settings

from core.secrets import unseal
from mail.models import SmtpSettings


@dataclass(frozen=True)
class SmtpConfig:
    host: str
    port: int
    security: str  # starttls, ssl or none
    username: str = ""
    password: str = ""
    from_address: str = ""

    @classmethod
    def of(cls, row: SmtpSettings) -> "SmtpConfig | None":
        """The saved settings, or None when the password can't be read anymore."""
        password = unseal(row.password) if row.password else ""
        if password is None:
            return None
        return cls(row.host, row.port, row.security, row.username, password, row.from_address)

    def backend_options(self) -> dict:
        """OPTIONS for Django's SMTP backend."""
        return {
            "host": self.host,
            "port": self.port,
            "username": self.username or None,
            "password": self.password or None,
            "use_tls": self.security == SmtpSettings.Security.STARTTLS,
            "use_ssl": self.security == SmtpSettings.Security.SSL,
        }


def environment() -> SmtpConfig | None:
    return SmtpConfig(**settings.FOLKBOOK_SMTP) if settings.FOLKBOOK_SMTP else None


def saved() -> SmtpSettings | None:
    return SmtpSettings.objects.select_related("set_by__me").first()


def current() -> SmtpConfig | None:
    """What email goes out through now; None: email isn't set up."""
    if config := environment():
        return config if config.from_address else None
    row = saved()
    return SmtpConfig.of(row) if row else None
