from core.secrets import seal, unseal


def test_a_sealed_secret_opens_again():
    token = seal("sk-abc")

    assert "sk-abc" not in token
    assert unseal(token) == "sk-abc"


def test_a_new_server_secret_cannot_open_old_ones(settings):
    token = seal("sk-abc")

    settings.SECRET_KEY = "a-completely-different-secret-key"

    assert unseal(token) is None


def test_garbage_does_not_open():
    assert unseal("not-a-token") is None
