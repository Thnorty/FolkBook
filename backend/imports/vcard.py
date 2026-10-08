"""Reading contacts from .vcf files (vCard 2.1, 3.0 and 4.0).

Our own small reader rather than `vobject`, which handles vCard 2.1 poorly: older
Android phones export 2.1 with quoted-printable names, as most Turkish names come out.
It reads only what FolkBook keeps (name, phones, emails, birthday, work, photo, note)
and never fetches anything a file points to: photos given as a URL are ignored.
"""

import base64
import binascii
import datetime
import quopri
import re
from dataclasses import dataclass

# Field lengths of the models they end up in.
NAME_LENGTH = 200
VALUE_LENGTH = 255
WORK_LENGTH = 200
NO_YEAR = 1604  # Apple's year for "no year" (vCard 3.0 can't say it)
LABELS = {"cell": "mobile", "mobile": "mobile", "iphone": "mobile", "home": "home", "work": "work"}


@dataclass
class Detail:
    """One phone number or email address."""

    value: str
    label: str  # "mobile", "home", "work" or ""


@dataclass
class Card:
    name: str
    phones: list[Detail]
    emails: list[Detail]
    birthday: tuple[int, int, int | None] | None  # (day, month, year)
    work: str
    photo: bytes | None
    note: str


class NotAVcard(Exception):
    pass


@dataclass
class _Line:
    name: str
    params: dict[str, list[str]]
    value: str


def read(data: bytes) -> tuple[list[Card], int]:
    """The contacts in a .vcf file, and how many had no name and were skipped."""
    text = _decode(data)
    if "BEGIN:VCARD" not in text.upper():
        raise NotAVcard
    cards: list[Card] = []
    skipped = 0
    for lines in _cards(_unfold(text)):
        card = _card(lines)
        if card is None:
            skipped += 1
        else:
            cards.append(card)
    return cards, skipped


def _decode(data: bytes) -> str:
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return data.decode("utf-16")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("latin-1")


def _unfold(text: str) -> list[str]:
    """Join continued lines: folded ones (starting with a space or tab) and 2.1's
    quoted-printable soft line breaks (a line ending in "=")."""
    lines: list[str] = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if lines and line[:1] in (" ", "\t"):
            lines[-1] += line[1:]
        elif lines and _soft_break(lines[-1]):
            lines[-1] = lines[-1][:-1] + line
        elif line.strip():
            lines.append(line)
    return lines


def _soft_break(line: str) -> bool:
    head = line.partition(":")[0].upper()
    return line.endswith("=") and "QUOTED-PRINTABLE" in head


def _cards(lines: list[str]) -> list[list[_Line]]:
    cards: list[list[_Line]] = []
    current: list[_Line] | None = None
    for raw in lines:
        line = _parse(raw)
        if line.name == "BEGIN" and line.value.upper() == "VCARD":
            current = []
        elif line.name == "END" and line.value.upper() == "VCARD":
            if current is not None:
                cards.append(current)
            current = None
        elif current is not None:
            current.append(line)
    return cards


def _parse(raw: str) -> _Line:
    head, _, value = raw.partition(":")
    name, *parts = head.split(";")
    params: dict[str, list[str]] = {}
    for part in parts:
        key, equals, values = part.partition("=")
        if not equals:  # 2.1 style: TEL;CELL;VOICE
            key, values = "TYPE", key
        params.setdefault(key.strip().upper(), []).extend(
            v.strip().strip('"').lower() for v in values.split(",")
        )
    name = name.rpartition(".")[2].strip().upper()  # item1.TEL → TEL
    if "quoted-printable" in params.get("ENCODING", []):
        charset = (params.get("CHARSET") or ["utf-8"])[0]
        decoded = quopri.decodestring(value.encode("latin-1", errors="replace"))
        value = decoded.decode(charset, errors="replace")
    return _Line(name, params, value)


def _card(lines: list[_Line]) -> Card | None:
    def first(name: str) -> _Line | None:
        return next((line for line in lines if line.name == name), None)

    name = _name(first("FN"), first("N"), first("ORG"))
    if not name:
        return None
    org, title = first("ORG"), first("TITLE")
    company = _split(org.value)[0] if org else ""
    work = ", ".join(part for part in (_text(title.value) if title else "", company) if part)
    return Card(
        name=name[:NAME_LENGTH],
        phones=[_detail(line) for line in lines if line.name == "TEL" and line.value.strip()],
        emails=[_detail(line) for line in lines if line.name == "EMAIL" and line.value.strip()],
        birthday=_birthday(first("BDAY")),
        work=work[:WORK_LENGTH],
        photo=_photo(first("PHOTO")),
        note="\n".join(_text(line.value) for line in lines if line.name == "NOTE").strip(),
    )


def _name(fn: _Line | None, n: _Line | None, org: _Line | None) -> str:
    if fn and _text(fn.value).strip():
        return _text(fn.value).strip()
    if n:
        family, given = [*_split(n.value), "", ""][:2]
        joined = " ".join(part for part in (given, family) if part)
        if joined:
            return joined
    return _split(org.value)[0] if org else ""


def _detail(line: _Line) -> Detail:
    types = line.params.get("TYPE", [])
    label = next((LABELS[t] for t in types if t in LABELS), "")
    return Detail(_text(line.value).strip()[:VALUE_LENGTH], label)


def _birthday(line: _Line | None) -> tuple[int, int, int | None] | None:
    if not line:
        return None
    value = line.value.strip()
    if match := re.match(r"^(\d{4})-?(\d{2})-?(\d{2})", value):
        year, month, day = (int(part) for part in match.groups())
    elif match := re.match(r"^--(\d{2})-?(\d{2})$", value):
        year, (month, day) = None, (int(part) for part in match.groups())
    else:
        return None
    if year == NO_YEAR or "X-APPLE-OMIT-YEAR" in line.params:
        year = None
    try:
        datetime.date(year or 2000, month, day)  # 2000: a leap year, so 29 Feb passes
    except ValueError:
        return None
    return day, month, year


def _photo(line: _Line | None) -> bytes | None:
    if not line:
        return None
    value = line.value.strip()
    if value.startswith("data:"):
        meta, _, value = value.partition(",")
        if ";base64" not in meta:
            return None
    elif not {"b", "base64"} & set(line.params.get("ENCODING", [])):
        return None  # a URL: never fetched
    try:
        return base64.b64decode("".join(value.split()), validate=True)
    except (binascii.Error, ValueError):
        return None


def _split(value: str) -> list[str]:
    """A structured value's parts (N, ORG), split on unescaped semicolons."""
    return [_text(part).strip() for part in re.split(r"(?<!\\);", value)]


def _text(value: str) -> str:
    return re.sub(r"\\(.)", lambda m: "\n" if m.group(1) in "nN" else m.group(1), value)
