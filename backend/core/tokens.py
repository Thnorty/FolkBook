"""Secret tokens for API keys and calendar links: long and random, kept only as a hash."""

import hashlib
import secrets
import string

LETTERS = string.ascii_letters + string.digits


def new_token(prefix: str) -> str:
    return prefix + "".join(secrets.choice(LETTERS) for _ in range(32))


def hash_token(token: str) -> str:
    # Tokens are long and random, so a fast hash is enough (unlike passwords).
    return hashlib.sha256(token.encode()).hexdigest()
