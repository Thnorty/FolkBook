from pathlib import Path

import pytest

from imports.vcard import Detail, NotAVcard, read

SAMPLES = Path(__file__).parent / "samples"


def sample(name: str) -> bytes:
    return (SAMPLES / name).read_bytes()


def card(text: str):
    cards, _ = read(f"BEGIN:VCARD\nVERSION:3.0\n{text}\nEND:VCARD\n".encode())
    return cards[0]


def test_android_21_quoted_printable():
    cards, skipped = read(sample("android-2.1.vcf"))

    assert [c.name for c in cards] == ["Ayşe Yılmaz", "Şükrü Öztürk"]
    assert cards[0].phones == [Detail("+90 532 111 22 33", "mobile")]
    assert cards[1].phones == [Detail("0216 555 44 33", "home")]
    assert cards[1].emails == [Detail("sukru@example.com", "home")]
    assert skipped == 0


def test_iphone_30():
    [tom], _ = read(sample("iphone-3.0.vcf"))

    assert tom.name == "Tom Bergqvist"
    assert tom.phones == [Detail("+46 70 123 45 67", "mobile")]
    assert tom.emails == [Detail("tom@example.com", "home")]
    assert tom.birthday == (14, 6, None)
    assert tom.work == "Designer, Acme"
    assert tom.photo.startswith(b"\xff\xd8")


def test_google_40():
    [anna], _ = read(sample("google-4.0.vcf"))

    assert anna.emails == [Detail("anna@post.pl", "work")]
    assert anna.phones == [Detail("+48 601 234 567", "mobile")]
    assert anna.birthday == (14, 6, None)
    assert anna.photo.startswith(b"\xff\xd8")


def test_name_falls_back_to_n_then_org():
    assert card("N:Kowalska;Anna;;;").name == "Anna Kowalska"
    assert card("ORG:Bora Bike Shop;").name == "Bora Bike Shop"

    cards, skipped = read(b"BEGIN:VCARD\nVERSION:3.0\nTEL:+90 1\nEND:VCARD\n")
    assert (cards, skipped) == ([], 1)


def test_folding_and_escapes():
    folded = card("FN:Emma\nNOTE:Line one\\nTwo\\, thr\n ee; and \\\\ more")

    assert folded.note == "Line one\nTwo, three; and \\ more"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("19900614", (14, 6, 1990)),
        ("1990-06-14", (14, 6, 1990)),
        ("1990-06-14T00:00:00Z", (14, 6, 1990)),
        ("--06-14", (14, 6, None)),
        ("--0614", (14, 6, None)),
        ("1604-06-14", (14, 6, None)),
        ("--0229", (29, 2, None)),
        ("1990-02-31", None),
        ("someday", None),
    ],
)
def test_birthdays(value, expected):
    assert card(f"FN:Emma\nBDAY:{value}").birthday == expected


def test_url_photos_are_ignored():
    assert card("FN:Emma\nPHOTO;VALUE=uri:https://example.com/a.jpg").photo is None
    assert card("FN:Emma\nPHOTO:https://example.com/a.jpg").photo is None


def test_crlf_and_bom():
    lf = sample("iphone-3.0.vcf")

    assert read(b"\xef\xbb\xbf" + lf.replace(b"\n", b"\r\n")) == read(lf)


def test_utf16():
    utf8 = sample("android-2.1.vcf")

    assert read(utf8.decode().encode("utf-16")) == read(utf8)


def test_long_text_is_cut():
    long = card(f"FN:{'a' * 300}\nTEL:{'1' * 400}")

    assert len(long.name) == 200
    assert len(long.phones[0].value) == 255


def test_not_a_vcard():
    with pytest.raises(NotAVcard):
        read(b"hello")


@pytest.mark.parametrize("value", ["0000-06-14", "1700-06-14", "2999-06-14"])
def test_a_year_we_cant_keep_is_dropped_not_the_birthday(value):
    assert card(f"FN:Emma\nBDAY:{value}").birthday == (14, 6, None)


def test_an_unknown_charset_reads_as_utf8():
    text = "FN;CHARSET=x-bogus;ENCODING=QUOTED-PRINTABLE:Ay=C5=9Fe"

    assert card(text).name == "Ayşe"


def test_bare_21_encodings():
    jpeg = (SAMPLES / "google-4.0.vcf").read_text().split("base64,")[1].split("\n")[0]

    assert card("FN;CHARSET=UTF-8;QUOTED-PRINTABLE:Ay=C5=9Fe").name == "Ayşe"
    assert card(f"FN:Emma\nPHOTO;JPEG;BASE64:{jpeg}").photo.startswith(b"\xff\xd8")


def test_tel_uris_lose_their_prefix():
    assert card("FN:Emma\nTEL;VALUE=uri;TYPE=cell:tel:+1-555-0100").phones == [
        Detail("+1-555-0100", "mobile")
    ]


def test_long_folded_lines_are_read_in_linear_time():
    import time

    photo = "PHOTO;ENCODING=b;TYPE=JPEG:" + "\n ".join(["QUJD" * 18] * 60_000)  # ~4 MB
    started = time.perf_counter()

    read(f"BEGIN:VCARD\nVERSION:3.0\nFN:Emma\n{photo}\nEND:VCARD\n".encode())

    assert time.perf_counter() - started < 2
