"""Asking the AI what a capture mentions.

Only the text and today's date are sent: the AI never sees the user's book. It answers
with mentions tied together by "refs"; FolkBook matches them to people afterwards. Its
answer is never trusted: anything that doesn't fit together is dropped quietly.
"""

import datetime
import json
import re
from dataclasses import dataclass, field

from ai.client import AiError, Target, chat
from interactions.models import Interaction
from people.models import MemoryAid, Person, Tag
from people.schemas import FIRST_YEAR, LAST_YEAR
from relationships.models import LABELLED_TYPES, Relationship, RelationshipType

ME = "me"
CONNECTION_TYPES = [str(t) for t in RelationshipType]
ENTRY_KINDS = [str(k) for k in Interaction.InteractionKind]
BAD_ANSWER = "The AI's answer didn't make sense. Try again."

_TEXT = {"type": "string"}
_MAYBE_TEXT = {"type": ["string", "null"]}


def _object(**properties) -> dict:
    # OpenAI's strict form: every property required, nothing else allowed.
    return {
        "type": "object",
        "properties": properties,
        "required": list(properties),
        "additionalProperties": False,
    }


def _list(item: dict) -> dict:
    return {"type": "array", "items": item}


CAPTURE_SCHEMA = _object(
    people=_list(
        _object(
            ref=_TEXT,
            name=_TEXT,
            how_we_met=_MAYBE_TEXT,
            work=_MAYBE_TEXT,
            birthday=_MAYBE_TEXT,
            tags=_list(_TEXT),
        )
    ),
    connections=_list(
        _object(
            a=_TEXT, b=_TEXT, type={"type": "string", "enum": CONNECTION_TYPES}, label=_MAYBE_TEXT
        )
    ),
    memory_aids=_list(_object(about=_TEXT, text=_TEXT)),
    entries=_list(
        _object(
            about=_TEXT,
            kind={"type": "string", "enum": ENTRY_KINDS},
            date=_TEXT,
            label=_MAYBE_TEXT,
            note=_TEXT,
        )
    ),
)

SYSTEM_PROMPT = """\
You read a short note someone wrote in their personal address book and list what it says \
about the people in it. Only write down what the note says; never guess or add anything.

- "me" is the person who wrote the note. Never list them under people.
- people: everyone the note names. Give each a short ref ("p1", "p2"…) and the name as \
written. how_we_met, work and birthday only when the note says them (birthday as \
YYYY-MM-DD, or --MM-DD without a year); tags are short words for interests or groups.
- connections: how two people (or "me" and someone) are related. a and b are refs or \
"me". For parent, grandparent and aunt_uncle, a is the parent / grandparent / aunt or \
uncle of b. met_at needs the place or event as label; custom needs a label too.
- memory_aids: short things worth remembering about someone ("Likes climbing"), about a ref.
- entries: things the writer did with someone, about a ref: met, call, message or event, \
or custom with a short label. date is YYYY-MM-DD, worked out from today's date \
("yesterday", "last Friday"); label is a short title like "Coffee"; note is one sentence.
- Leave lists empty when the note says nothing for them."""


@dataclass
class AiDraft:
    """What the AI found, cleaned: every part refers to someone it lists."""

    people: list[dict] = field(default_factory=list)
    connections: list[dict] = field(default_factory=list)
    memory_aids: list[dict] = field(default_factory=list)
    entries: list[dict] = field(default_factory=list)


def read_capture(target: Target, text: str, today: datetime.date) -> AiDraft:
    """Ask the AI what `text` mentions. A nonsensical answer is asked for once more."""
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Today is {today:%Y-%m-%d}.\n\n{text}"},
    ]
    for _attempt in range(2):
        reply = chat(target, messages, schema=CAPTURE_SCHEMA)
        try:
            return _clean(json.loads(reply), today)
        except (ValueError, TypeError, KeyError, AttributeError):
            continue
    raise AiError("bad_answer", BAD_ANSWER)


def _clean(answer: dict, today: datetime.date) -> AiDraft:
    """Raises on a wrong overall shape; quietly drops parts that don't fit together."""
    if not isinstance(answer, dict) or not all(
        isinstance(answer.get(part), list)
        for part in ("people", "connections", "memory_aids", "entries")
    ):
        raise ValueError("not a capture")
    draft = AiDraft()
    # The server's own refs (p1, p2…): the AI's could clash with "me" or the draft's ids.
    refs: dict[str, str] = {}
    for item in answer["people"]:
        person = _person(item)
        if person and person["ref"] not in refs and person["ref"] != ME:
            refs[person["ref"]] = person["ref"] = f"p{len(refs) + 1}"
            draft.people.append(person)
    known = refs | {ME: ME}
    for connection in filter(None, map(_connection, answer["connections"])):
        a, b = known.get(connection["a"]), known.get(connection["b"])
        if a and b and a != b:
            draft.connections.append(connection | {"a": a, "b": b})
    for part in filter(None, map(_aid, answer["memory_aids"])):
        if part["about"] in refs:
            draft.memory_aids.append(part | {"about": refs[part["about"]]})
    for part in filter(None, (_entry(item, today) for item in answer["entries"])):
        if part["about"] in refs:
            draft.entries.append(part | {"about": refs[part["about"]]})
    return draft


def _text(item: dict, key: str, model=None, field: str | None = None) -> str:
    """The stripped text, cut to what `model.field` can hold."""
    value = item.get(key)
    text = value.strip() if isinstance(value, str) else ""
    return text[: model._meta.get_field(field or key).max_length] if model else text


def _person(item) -> dict | None:
    if not isinstance(item, dict) or not _text(item, "ref") or not _text(item, "name"):
        return None
    tags = item.get("tags") if isinstance(item.get("tags"), list) else []
    return {
        "ref": _text(item, "ref"),
        "name": _text(item, "name", Person),
        "how_we_met": _text(item, "how_we_met", Person) or None,
        "work": _text(item, "work", Person) or None,
        "birthday": _birthday(item.get("birthday")),
        "tags": list(dict.fromkeys(t.strip() for t in tags if _fits_tag(t))),
    }


def _birthday(value) -> dict | None:
    match = (
        re.fullmatch(r"(\d{4}|-)-(\d{2})-(\d{2})", value.strip())
        if isinstance(value, str)
        else None
    )
    if not match:
        return None
    year = int(match[1]) if match[1] != "-" else None
    if year is not None and not FIRST_YEAR <= year <= LAST_YEAR:
        year = None  # "0000" and the like: a model's way of saying it doesn't know
    day, month = int(match[3]), int(match[2])
    try:
        datetime.date(year or 2000, month, day)  # 2000: a leap year, so 29 February fits
    except ValueError:
        return None
    return {"day": day, "month": month, "year": year}


def _connection(item) -> dict | None:
    if not isinstance(item, dict) or item.get("type") not in CONNECTION_TYPES:
        return None
    connection = {
        "a": _text(item, "a"),
        "b": _text(item, "b"),
        "type": item["type"],
        "label": _text(item, "label", Relationship),
    }
    if connection["type"] in LABELLED_TYPES and not connection["label"]:
        return None
    return connection


def _aid(item) -> dict | None:
    if not isinstance(item, dict) or not _text(item, "text"):
        return None
    return {"about": _text(item, "about"), "text": _text(item, "text", MemoryAid)}


def _entry(item, today: datetime.date) -> dict | None:
    if not isinstance(item, dict) or item.get("kind") not in ENTRY_KINDS:
        return None
    try:
        date = datetime.date.fromisoformat(_text(item, "date"))
    except ValueError:
        return None
    label = _text(item, "label", Interaction)
    if item["kind"] == Interaction.InteractionKind.CUSTOM and not label:
        label = "Other"  # what the timeline calls an entry of no particular kind
    return {
        "about": _text(item, "about"),
        "kind": item["kind"],
        "date": min(date, today),
        "label": label,
        "note": _text(item, "note", Interaction),
    }


def _fits_tag(tag) -> bool:
    return isinstance(tag, str) and 0 < len(tag.strip()) <= Tag._meta.get_field("name").max_length
