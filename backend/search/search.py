"""One search over everything the user can see, grouped, for the command palette."""

import difflib
import unicodedata
from dataclasses import dataclass

from django.db.models import Q, QuerySet

from access.policy import Access, visible_memory_aids, visible_notes, visible_people
from core.db import by_name
from people.models import MemoryAid, Note, Person
from people.search import search_people
from spaces.models import Space

LIMIT = 6
SNIPPET = 30  # characters of context on each side of a match in a note


@dataclass(frozen=True)
class NoteHit:
    person: Person
    snippet: str


def fold(text: str) -> str:
    """Lowercase, without accents, so "Yılmaz" and "yilmaz" compare equal."""
    decomposed = unicodedata.normalize("NFKD", text.replace("ı", "i").casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _contains_every_word(field: str, text: str) -> Q:
    query = Q()
    for word in text.split():
        query &= Q(**{f"{field}__unaccent__icontains": word})
    return query


def matching_spaces(spaces: QuerySet[Space], text: str) -> QuerySet[Space]:
    return spaces.filter(_contains_every_word("name", text))[:LIMIT]


def matching_memory_aids(access: Access, text: str) -> QuerySet[MemoryAid]:
    aids = visible_memory_aids(access).select_related("person")
    return aids.filter(_contains_every_word("text", text))[:LIMIT]


def matching_notes(access: Access, text: str) -> list[NoteHit]:
    notes: QuerySet[Note] = visible_notes(access).select_related("person")
    return [
        NoteHit(note.person, snippet(note.body, text))
        for note in notes.filter(_contains_every_word("body", text))[:LIMIT]
    ]


def snippet(body: str, text: str) -> str:
    """The words around the first word of `text` in `body`, with "…" where cut."""
    at = fold(body).find(fold(text.split()[0])) if text.split() else -1
    if at < 0:
        return body[: SNIPPET * 2] + ("…" if len(body) > SNIPPET * 2 else "")
    start, end = max(0, at - SNIPPET), at + SNIPPET + len(text)
    words = body[start:end].split()
    # Drop words cut in half at either end.
    if start > 0 and not body[start - 1].isspace():
        words = words[1:]
    if end < len(body) and not body[end].isspace():
        words = words[:-1]
    return ("…" if start > 0 else "") + " ".join(words) + ("…" if end < len(body) else "")


def did_you_mean(access: Access, text: str) -> Person | None:
    """The visible person whose name (or first name) is closest to `text`, if any is close."""
    people = list(visible_people(access).only("id", "name"))
    names: dict[str, Person] = {}
    for person in people:
        names.setdefault(fold(person.name), person)
        names.setdefault(fold(person.name.split()[0]), person)
    close = difflib.get_close_matches(fold(text), names, n=1, cutoff=0.7)
    return names[close[0]] if close else None


def matching_people(access: Access, people: QuerySet[Person], text: str) -> QuerySet[Person]:
    return search_people(access, people, text).order_by(by_name(), "pk")[:LIMIT]
