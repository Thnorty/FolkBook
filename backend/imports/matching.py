"""Who a contact from a .vcf already is in the user's book.

Compared only with people the user can see, and by contact details only where they
can see them, so a match never reveals anything new. Everyone is loaded once and
compared here, so the queries don't grow with the file.
"""

import re
import unicodedata
from dataclasses import dataclass
from typing import Literal

from django.db.models import Prefetch

from access.policy import (
    Access,
    can_merge_into,
    visible_contact_methods,
    visible_people,
    visible_spaces,
)
from imports.vcard import Card
from people.models import ContactMethod, Person

Reason = Literal["phone", "email", "name", "initial"]
PHONE_DIGITS = 9  # enough to ignore country codes and leading zeros
MIN_PHONE_DIGITS = 7  # shorter numbers (112, short codes) are never matched


@dataclass
class Match:
    person: Person
    reason: Reason
    sure: bool
    can_merge: bool
    by_details: bool  # same phone or email: already in the book


def fold(text: str) -> str:
    """Ignoring case and accents, as search does: "Ayşe YILMAZ" → "ayse yilmaz"."""
    decomposed = unicodedata.normalize("NFKD", text.replace("ı", "i"))
    plain = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(plain.casefold().split())


def phone_key(value: str) -> str | None:
    digits = re.sub(r"\D", "", value)
    return digits[-PHONE_DIGITS:] if len(digits) >= MIN_PHONE_DIGITS else None


def find_matches(access: Access, cards: list[Card]) -> list[Match | None]:
    """The best match for each card, or None."""
    people = list(
        visible_people(access)
        .select_related("owner")
        .prefetch_related(
            Prefetch("contact_methods", visible_contact_methods(access), to_attr="shown"),
            Prefetch("spaces", visible_spaces(access).order_by("name"), to_attr="spaces_shown"),
        )
    )
    # The user's own people first, so they win a tie with someone shared.
    people.sort(key=lambda person: person.owner_id != access.user.pk)
    index = _Index(people)
    return [index.match(access, card) for card in cards]


def _initial(word: str) -> str | None:
    """ "K." or "K" → "k"."""
    return word[0] if re.fullmatch(r"\w\.?", word) else None


class _Index:
    def __init__(self, people: list[Person]):
        self.phones: dict[str, Person] = {}
        self.emails: dict[str, Person] = {}
        self.names: dict[str, Person] = {}
        self.by_initial: dict[tuple[str, str], Person] = {}  # (first name, family initial)
        self.with_initial: dict[tuple[str, str], Person] = {}  # people saved as "Anna K."
        for person in people:
            for method in person.shown:
                if method.kind == ContactMethod.ContactKind.PHONE and (
                    key := phone_key(method.value)
                ):
                    self.phones.setdefault(key, person)
                elif method.kind == ContactMethod.ContactKind.EMAIL:
                    self.emails.setdefault(method.value.strip().casefold(), person)
            name = fold(person.name)
            self.names.setdefault(name, person)
            words = name.split()
            if len(words) >= 2:
                if letter := _initial(words[-1]):
                    self.with_initial.setdefault((words[0], letter), person)
                else:
                    self.by_initial.setdefault((words[0], words[-1][0]), person)

    def match(self, access: Access, card: Card) -> Match | None:
        def found(person: Person, reason: Reason) -> Match:
            return Match(
                person=person,
                reason=reason,
                sure=reason != "initial",
                can_merge=can_merge_into(access, person),
                by_details=reason in ("phone", "email"),
            )

        for phone in card.phones:
            if (key := phone_key(phone.value)) and key in self.phones:
                return found(self.phones[key], "phone")
        for email in card.emails:
            if person := self.emails.get(email.value.strip().casefold()):
                return found(person, "email")
        name = fold(card.name)
        if person := self.names.get(name):
            return found(person, "name")
        words = name.split()
        if len(words) >= 2:
            if letter := _initial(words[-1]):
                person = self.by_initial.get((words[0], letter))
            else:
                person = self.with_initial.get((words[0], words[-1][0]))
            if person:
                return found(person, "initial")
        return None
