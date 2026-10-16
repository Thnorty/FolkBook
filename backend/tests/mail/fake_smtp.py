"""A stand-in for smtplib's SMTP and SMTP_SSL: records what Django's SMTP backend does,
and fails where a test asks it to."""

import smtplib
from dataclasses import dataclass, field

import pytest


@dataclass
class FakeSmtp:
    ssl: bool = False
    connected: tuple | None = None
    started_tls: bool = False
    logged_in: tuple | None = None
    sent: list = field(default_factory=list)  # (from, to, message)
    fail: dict = field(default_factory=dict)  # step ("connect", "starttls", ...) -> error

    def connection_class(self, ssl: bool):
        fake = self

        class Connection:
            def __init__(self, host, port, **params):
                fake.ssl, fake.connected = ssl, (host, port)
                fake._raise("connect")

            def starttls(self, **params):
                fake._raise("starttls")
                fake.started_tls = True

            def login(self, username, password):
                fake._raise("login")
                fake.logged_in = (username, password)

            def sendmail(self, from_address, to, message, **options):
                fake._raise("sendmail")
                fake.sent.append((from_address, to, message))

            def quit(self):
                pass

            close = quit

        return Connection

    def _raise(self, step: str) -> None:
        if step in self.fail:
            raise self.fail[step]


@pytest.fixture
def fake_smtp(monkeypatch) -> FakeSmtp:
    fake = FakeSmtp()
    monkeypatch.setattr(smtplib, "SMTP", fake.connection_class(ssl=False))
    monkeypatch.setattr(smtplib, "SMTP_SSL", fake.connection_class(ssl=True))
    return fake
