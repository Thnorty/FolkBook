"""Secrets kept at rest, encrypted: AI keys now, SMTP passwords later.

Sealed with Fernet (AES plus a signature, so a damaged token never opens) under a key
derived from DJANGO_SECRET_KEY. Change that secret and everything sealed before can't be
read anymore: the app asks for those secrets again.
"""

import base64

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings


def _fernet() -> Fernet:
    # Derived every time: it's cheap, and it follows the settings (tests change them).
    key = HKDF(algorithm=SHA256(), length=32, salt=None, info=b"folkbook secrets v1").derive(
        settings.SECRET_KEY.encode()
    )
    return Fernet(base64.urlsafe_b64encode(key))


def seal(text: str) -> str:
    """`text`, encrypted, as a string safe to store."""
    return _fernet().encrypt(text.encode()).decode()


def unseal(token: str) -> str | None:
    """What `seal` was given, or None when it can't be read (damaged, or the secret changed)."""
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None
