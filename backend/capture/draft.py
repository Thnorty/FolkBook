"""Suggest: ask the AI, then match what it read to the people you can see.

Matching happens here, on the server, so the AI never sees the book. Only people you can
see are ever candidates, so a draft never reveals anyone new.
"""

from collections import defaultdict
from urllib.parse import urlsplit

from django.core.exceptions import ValidationError
from django.db.models import Prefetch

from access.policy import (
    Access,
    can_edit_person,
    editable_spaces,
    people_in_space,
    visible_people,
    visible_spaces,
)
from ai.client import LOCALHOST_HINT, AiError, Target
from ai.services import key_of, provider_for
from capture.prompt import BAD_ANSWER, AiDraft, read_capture
from capture.schemas import SuggestIn
from core.api import Conflict
from core.db import by_name
from imports.matching import fold
from people.models import Person
from relationships.models import ParentType, RelationshipType
from spaces.models import Space

AI_OFF = "AI is off: add a key in Settings → AI."
UNREADABLE_KEY = "Your key can't be read anymore. Enter it again in Settings → AI."
MAX_CANDIDATES = 3


def suggest(access: Access, data: SuggestIn) -> dict:
    """The draft for `data.text`. Raises AiError, in words for the person, when the AI fails."""
    space = _space(access, data.space_id)
    row = provider_for(access.user)
    if row is None:
        raise Conflict(AI_OFF)
    if key_of(row) is None:
        raise AiError("unreadable", UNREADABLE_KEY)
    target = Target.of(row)
    try:
        ai = read_capture(target, data.text, data.today)
    except AiError as error:
        raise AiError(error.kind, _say(error, target)) from None
    return build_draft(access, ai, space)


def build_draft(access: Access, ai: AiDraft, space: Space | None) -> dict:
    people = _people(access)
    in_space = set(people_in_space(access, space).values_list("pk", flat=True)) if space else set()
    by_name_, by_first = defaultdict(list), defaultdict(list)
    for person in people:
        name = fold(person.name)
        by_name_[name].append(person)
        by_first[name.split(" ")[0]].append(person)

    drafted = []
    for mention in ai.people:
        match, found = _match(access, fold(mention["name"]), by_name_, by_first)
        candidates = [_candidate(access, person, person.pk in in_space) for person in found]
        drafted.append(mention | {"match": match, "candidates": candidates})
    return {
        "people": drafted,
        "connections": [
            connection
            | {
                "id": f"c{n}",
                "parent_type": ParentType.BIOLOGICAL
                if connection["type"] == RelationshipType.PARENT
                else None,
            }
            for n, connection in enumerate(ai.connections, 1)
        ],
        "memory_aids": [aid | {"id": f"m{n}"} for n, aid in enumerate(ai.memory_aids, 1)],
        "entries": [entry | {"id": f"e{n}"} for n, entry in enumerate(ai.entries, 1)],
    }


def _space(access: Access, space_id) -> Space | None:
    if space_id is None:
        return None
    space = editable_spaces(access).filter(pk=space_id).first()
    if space is None:
        raise ValidationError({"space_id": "You can't add people to that space."})
    return space


def _say(error: AiError, target: Target) -> str:
    """The AI's failure, in the words the capture page shows."""
    if error.kind == "refused":
        return "Your key was refused. Check Settings → AI."
    if error.kind == "timeout":
        return "The AI didn't answer in time (90 s)."
    if error.kind == "bad_answer":
        return BAD_ANSWER
    if error.kind == "unreachable":
        message = f"Can't reach the AI at {target.base_url}"
        if urlsplit(target.base_url).hostname in {"localhost", "127.0.0.1", "::1"}:
            message += f". {LOCALHOST_HINT}"
        return message
    return error.message


def _people(access: Access) -> list[Person]:
    """Everyone you can see but yourself ("me" is the writer), your own people first."""
    people = list(
        visible_people(access)
        .exclude(account=access.user)
        .select_related("owner__me")
        .prefetch_related(
            "tags",
            Prefetch("spaces", visible_spaces(access).order_by(by_name()), to_attr="spaces_shown"),
        )
    )
    people.sort(key=lambda person: (person.owner_id != access.user.pk, fold(person.name)))
    return people


def _match(access: Access, name: str, by_name_: dict, by_first: dict) -> tuple[str, list]:
    """A full name you have is a match (your own person winning a tie); a first name alone
    always asks, since it may well be someone new."""
    same = by_name_.get(name, [])
    if same:
        own = [person for person in same if person.owner_id == access.user.pk]
        found = own or same
        return ("match" if len(found) == 1 else "choose"), found[:MAX_CANDIDATES]
    found = by_first.get(name.split(" ")[0], [])
    return ("choose" if found else "new"), found[:MAX_CANDIDATES]


def _candidate(access: Access, person: Person, in_space: bool) -> dict:
    tags = sorted((tag.name for tag in person.tags.all()), key=str.casefold)
    birthday = (
        {"day": person.birth_day, "month": person.birth_month, "year": person.birth_year}
        if person.birth_day is not None
        else None
    )
    spaces = " · ".join(space.name for space in person.spaces_shown)
    return {
        "id": person.pk,
        "name": person.name,
        "detail": person.how_we_met or person.work or spaces,
        "owner": getattr(person.owner, "me", None),
        "current": {
            "how_we_met": person.how_we_met,
            "work": person.work,
            "birthday": birthday,
            "tags": tags,
        },
        "can_edit": can_edit_person(access, person),
        "can_tag": not access.read_only and person.owner_id == access.user.pk,
        "in_space": in_space,
    }
