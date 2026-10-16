"""Sending email, and the server's SMTP settings: seeing, saving and testing them (admins)."""

import logging
import re
import smtplib
import ssl
from email.utils import parseaddr
from urllib.parse import urlsplit

from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.mail import EmailMultiAlternatives, mailers
from django.core.validators import validate_email
from django.template.loader import render_to_string

from accounts.models import User
from core.api import Conflict
from core.secrets import seal, unseal
from mail.backend import TIMEOUT, EmailBackend, EmailNotSetUp
from mail.config import SmtpConfig, current, environment, saved
from mail.models import SmtpSettings
from mail.schemas import SmtpIn

logger = logging.getLogger("folkbook")

HOST = re.compile(r"[A-Za-z0-9.\-]+|\[[0-9A-Fa-f:.]+\]")
UNREADABLE = (
    "The saved password can't be read anymore (the server's secret changed). Enter it again."
)


def email_ready() -> bool:
    return current() is not None


def send(
    to: str,
    subject: str,
    template: str,
    context: dict,
    *,
    preview: str = "",
    headers: dict | None = None,
) -> None:
    """One email: `mail/{template}.txt` and `.html`, through the server's mailer.

    Raises EmailNotSetUp without one.
    """
    config = current()
    if config is None:
        raise EmailNotSetUp
    message = _message(config, to, subject, template, context, preview)
    message.extra_headers.update(headers or {})
    mailers.default.send_messages([message])


def mail_settings(admin: User) -> dict:
    _check_admin(admin)
    env, row = environment(), saved()
    return {
        "ready": email_ready(),
        "source": "environment" if env else "saved" if row else None,
        "smtp": _out(env, None) if env else _out(SmtpConfig.of(row), row) if row else None,
        "links_to": settings.FOLKBOOK_URL,
        "send_to": admin.email,
    }


def save_settings(admin: User, data: SmtpIn) -> SmtpSettings:
    _check_admin(admin)
    _check_not_environment()
    row = saved() or SmtpSettings()
    config = _config(data, row if row.pk else None)
    row.host, row.port, row.security = config.host, config.port, config.security
    row.username, row.from_address = config.username, config.from_address
    row.password = seal(config.password) if config.password else ""
    row.set_by = admin
    row.save()
    return row


def remove_settings(admin: User) -> None:
    _check_admin(admin)
    _check_not_environment()
    SmtpSettings.objects.all().delete()


def send_test(admin: User, data: SmtpIn | None) -> dict:
    """A short email to the admin, through the form's settings (or the ones in use)."""
    _check_admin(admin)
    if data is None:
        config = current()
        if config is None:
            return {"ok": False, "message": "Email isn't set up yet."}
    else:
        _check_not_environment()
        config = _config(data, saved())
    context = {"host": config.host, "admin": admin.display_name}
    message = _message(config, admin.email, "FolkBook can send email", "test", context, "")
    try:
        EmailBackend(config=config).send_messages([message])
    except (smtplib.SMTPException, OSError) as error:
        logger.info("Test email through %s failed: %s", config.host, type(error).__name__)
        return {"ok": False, "message": _explain(error, config, admin.email)}
    return {"ok": True, "message": f"Sent to {admin.email}"}


def _message(
    config: SmtpConfig, to: str, subject: str, template: str, context: dict, preview: str
) -> EmailMultiAlternatives:
    context = {
        **context,
        "subject": subject,
        "preview": preview,
        "site": urlsplit(settings.FOLKBOOK_URL).netloc,
    }
    message = EmailMultiAlternatives(
        subject,
        render_to_string(f"mail/{template}.txt", context).strip() + "\n",
        config.from_address,
        [to],
    )
    message.attach_alternative(render_to_string(f"mail/{template}.html", context), "text/html")
    return message


def _explain(error: OSError, config: SmtpConfig, to: str) -> str:
    """What went wrong, in the app's words: never the server's reply."""
    server = f"{config.host}:{config.port}"
    secure = "Check Security and the port (587 is usually STARTTLS, 465 SSL / TLS)."
    match error:
        case smtplib.SMTPAuthenticationError():
            return "The server refused the username or password."
        case smtplib.SMTPSenderRefused():
            return f"The server refused the From address ({parseaddr(config.from_address)[1]})."
        case smtplib.SMTPRecipientsRefused():
            return f"The server refused to send to {to}."
        case smtplib.SMTPNotSupportedError() if "STARTTLS" in str(error):
            return f"{server} doesn't offer STARTTLS. {secure}"
        case smtplib.SMTPNotSupportedError():
            return "The server doesn't take a username and password. Leave them empty."
        case smtplib.SMTPServerDisconnected():
            return f"{server} hung up. {secure}"
        case smtplib.SMTPException():  # before OSError, which every SMTPException is
            return "The server didn't take the email."
        case ssl.SSLError():
            return f"Couldn't start a secure connection with {server}. {secure}"
        case TimeoutError():
            return f"No answer from {server} in {TIMEOUT} seconds."
        case _:  # any other OSError: refused, no such host, no network
            return f"Can't reach {server}."


def _config(data: SmtpIn, row: SmtpSettings | None) -> SmtpConfig:
    """The form's settings, checked, with the password it means."""
    host, username = data.host.strip(), data.username.strip()
    if not HOST.fullmatch(host):
        raise ValidationError({"host": "Use the server's name, like smtp.fastmail.com."})
    return SmtpConfig(
        host=host,
        port=data.port,
        security=data.security,
        username=username,
        password=_password(data, row, host, username),
        from_address=_from_address(data.from_address),
    )


def _password(data: SmtpIn, row: SmtpSettings | None, host: str, username: str) -> str:
    """What was typed, else the saved one: but only for the saved server and username, so a
    saved password never goes anywhere else."""
    if data.password is not None:
        return data.password
    if row is None or not row.password:
        return ""
    if (host.lower(), username) != (row.host.lower(), row.username):
        raise ValidationError({"password": "Enter the password again for a new server or user."})
    password = unseal(row.password)
    if password is None:
        raise ValidationError({"password": UNREADABLE})
    return password


def _from_address(value: str) -> str:
    value = value.strip()
    _, address = parseaddr(value)
    try:
        if "\n" in value or "\r" in value or not address:
            raise ValidationError("no address")
        validate_email(address)
    except ValidationError as error:
        raise ValidationError(
            {"from_address": "Use an address like FolkBook <folkbook@example.com>."}
        ) from error
    return value


def _check_admin(user: User) -> None:
    if not user.is_staff:
        raise PermissionDenied("Only admins can set up email.")


def _check_not_environment() -> None:
    if environment():
        raise Conflict(
            "Email is set in the server's environment (FOLKBOOK_SMTP_*). Change it there."
        )


def _out(config: SmtpConfig | None, row: SmtpSettings | None) -> dict:
    """Saved settings (`row`), or the environment's (only `config`): never a password."""
    source = row or config
    return {
        "host": source.host,
        "port": source.port,
        "security": source.security,
        "username": source.username,
        "has_password": bool(row.password if row else config.password),
        "password_unreadable": config is None,
        "from_address": source.from_address,
        "set_by": row.set_by.display_name if row and row.set_by else None,
        "updated_at": row.updated_at if row else None,
    }
