"""Sending email: Send test email through the form's settings, errors in the app's words,
and `send` through the server's mailer."""

import smtplib
import ssl

import pytest
from django.core.mail import mailers

from mail import services
from mail.backend import EmailBackend, EmailNotSetUp
from tests.mail.test_settings import FASTMAIL

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin(world):
    world.ela.is_staff = True
    world.ela.save()
    return world.ela


def test_a_test_email_goes_through_the_forms_settings(api, admin, fake_smtp):
    response = api.login(admin).post("/mail/test", {"smtp": FASTMAIL})

    assert response.json() == {"ok": True, "message": "Sent to ela@example.com"}
    assert fake_smtp.connected == ("smtp.fastmail.com", 587)
    assert fake_smtp.started_tls and not fake_smtp.ssl
    assert fake_smtp.logged_in == ("ela@fastmail.com", "app-password-9d2k")
    [(sender, to, message)] = fake_smtp.sent
    assert (sender, to) == ("folkbook@ela.home", ["ela@example.com"])
    assert b"Email works" in message


def test_ssl_and_no_login(api, admin, fake_smtp):
    relay = {**FASTMAIL, "security": "ssl", "port": 465, "username": "", "password": ""}

    assert api.login(admin).post("/mail/test", {"smtp": relay}).json()["ok"] is True
    assert fake_smtp.ssl and not fake_smtp.started_tls
    assert fake_smtp.logged_in is None


def test_testing_does_not_save(api, admin, fake_smtp):
    client = api.login(admin)
    client.post("/mail/test", {"smtp": FASTMAIL})

    assert client.get("/mail").json()["ready"] is False


def test_a_test_uses_the_saved_password_for_the_saved_server_only(api, admin, fake_smtp):
    client = api.login(admin)
    client.put("/mail", FASTMAIL)

    client.post("/mail/test", {"smtp": {**FASTMAIL, "password": None}})
    elsewhere = client.post(
        "/mail/test", {"smtp": {**FASTMAIL, "host": "smtp.evil.example", "password": None}}
    )

    assert fake_smtp.logged_in == ("ela@fastmail.com", "app-password-9d2k")
    assert elsewhere.status_code == 422
    assert fake_smtp.connected == ("smtp.fastmail.com", 587)


def test_without_settings_it_tests_the_ones_in_use(api, admin, email_ready, fake_smtp):
    client = api.login(admin)

    assert client.post("/mail/test", {}).json()["ok"] is True
    assert fake_smtp.connected == ("smtp.example.net", 587)
    assert client.post("/mail/test", {"smtp": FASTMAIL}).status_code == 409  # read-only here


def test_nothing_to_test_without_email(api, admin):
    assert api.login(admin).post("/mail/test", {}).json() == {
        "ok": False,
        "message": "Email isn't set up yet.",
    }


REPLY = b"5.7.8 internal-relay-17 secret detail"


@pytest.mark.parametrize(
    ("step", "error", "message"),
    [
        (
            "login",
            smtplib.SMTPAuthenticationError(535, REPLY),
            "The server refused the username or password.",
        ),
        (
            "sendmail",
            smtplib.SMTPSenderRefused(553, REPLY, "folkbook@ela.home"),
            "The server refused the From address (folkbook@ela.home).",
        ),
        (
            "sendmail",
            smtplib.SMTPRecipientsRefused({"ela@example.com": (550, REPLY)}),
            "The server refused to send to ela@example.com.",
        ),
        (
            "starttls",
            smtplib.SMTPNotSupportedError("STARTTLS extension not supported by server."),
            "smtp.fastmail.com:587 doesn't offer STARTTLS. Check Security and the port "
            "(587 is usually STARTTLS, 465 SSL / TLS).",
        ),
        (
            "login",
            smtplib.SMTPNotSupportedError("SMTP AUTH extension not supported by server."),
            "The server doesn't take a username and password. Leave them empty.",
        ),
        (
            "connect",
            smtplib.SMTPServerDisconnected("Connection unexpectedly closed"),
            "smtp.fastmail.com:587 hung up. Check Security and the port "
            "(587 is usually STARTTLS, 465 SSL / TLS).",
        ),
        (
            "starttls",
            ssl.SSLError("WRONG_VERSION_NUMBER"),
            "Couldn't start a secure connection with smtp.fastmail.com:587. Check Security "
            "and the port (587 is usually STARTTLS, 465 SSL / TLS).",
        ),
        ("connect", TimeoutError(), "No answer from smtp.fastmail.com:587 in 15 seconds."),
        ("connect", ConnectionRefusedError(), "Can't reach smtp.fastmail.com:587."),
        ("sendmail", smtplib.SMTPDataError(554, REPLY), "The server didn't take the email."),
    ],
)
def test_errors_are_said_in_the_apps_words(api, admin, fake_smtp, step, error, message):
    fake_smtp.fail[step] = error

    response = api.login(admin).post("/mail/test", {"smtp": FASTMAIL})

    assert response.json() == {"ok": False, "message": message}
    assert "secret" not in response.content.decode()


def test_send_goes_through_the_mailer_from_the_servers_address(email_ready, mailoutbox):
    services.send("tom@example.com", "Hello", "test", {"host": "smtp.example.net", "admin": "Ela"})

    [message] = mailoutbox
    assert message.from_email == "FolkBook <folkbook@example.net>"
    assert message.to == ["tom@example.com"]
    assert "Email works" in message.body
    [(html, kind)] = message.alternatives
    assert kind == "text/html"
    assert "folk.example.net" in html


def test_nothing_is_sent_without_email(mailoutbox):
    with pytest.raises(EmailNotSetUp):
        services.send("tom@example.com", "Hello", "test", {})
    assert mailoutbox == []


def test_the_mailer_is_set_up_from_the_settings(settings, email_ready):
    settings.MAILERS = {"default": {"BACKEND": "mail.backend.EmailBackend"}}

    mailer = mailers.default

    assert isinstance(mailer, EmailBackend)
    assert (mailer.host, mailer.port, mailer.use_tls, mailer.use_ssl) == (
        "smtp.example.net",
        587,
        True,
        False,
    )
    assert (mailer.username, mailer.timeout) == ("folkbook", 15)


def test_the_mailer_refuses_without_settings(settings):
    settings.MAILERS = {"default": {"BACKEND": "mail.backend.EmailBackend"}}

    with pytest.raises(EmailNotSetUp):
        mailers.default  # noqa: B018 — making it is what fails
