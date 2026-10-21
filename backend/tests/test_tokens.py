"""Secret tokens: API keys and calendar links are made and stored the same way."""

import hashlib
import re

from core.tokens import hash_token, new_token


def test_a_token_is_its_prefix_and_32_letters_or_digits():
    token = new_token("fb_cal_")

    assert re.fullmatch(r"fb_cal_[A-Za-z0-9]{32}", token)
    assert new_token("fb_cal_") != token


def test_a_token_is_stored_as_its_sha256():
    assert hash_token("abc") == hashlib.sha256(b"abc").hexdigest()
