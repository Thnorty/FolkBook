"""Kept copies: when a user loses sight of someone they wrote about, they keep a copy.

Access ends when a user leaves a space or is removed from it, when its owner stops
sharing or deletes it, and when someone is taken out of a space or deleted. Wrap such
a change in `keeping_copies`: it compares what each user could see before and after.
For everyone a user lost and had notes, memory aids or timeline entries about, they
get a copy in their own book with those moved over, marked "kept" (design 4n, 4o,
5a–5d). Their links follow where they still can; the rest go.
"""

from collections import defaultdict
from collections.abc import Callable, Iterable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from uuid import UUID

from django.core.files import File
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from access.policy import Access, visible_contact_methods, visible_people, visible_spaces
from accounts.models import User
from core.db import by_name
from interactions.models import Interaction
from people import services as people
from people.models import AccessEnded, ContactMethod, MemoryAid, Note, Person
from relationships.models import Relationship
from relationships.services import stored_order
from reminders.models import KeepInTouch

Reason = AccessEnded.Reason

# What a user wrote about someone that's worth keeping a copy for (with its author field).
WRITTEN = ((Note, "author"), (MemoryAid, "author"), (Interaction, "author"))
# Moves over to the copy, but isn't worth a copy on its own.
FOLLOWS = (*WRITTEN, (KeepInTouch, "user"))


@dataclass
class Change:
    """Who changed what, for the copies' "kept from" line and the users' Today card."""

    by: User
    reason: Reason  # told to anyone who keeps copies
    space: str = ""  # the space's name: what the access came through
    about: str = ""  # the member who left, or the person taken out or deleted
    told: dict[UUID, Reason] = field(default_factory=dict)  # told even without copies
    kept: dict[UUID, list[Person]] = field(default_factory=dict)  # filled in afterwards


@dataclass
class _Before:
    people: set[UUID]
    written: set[UUID]  # people among them the user wrote something about
    contacts: dict[UUID, list[ContactMethod]]  # the numbers they could see of those


@contextmanager
def keeping_copies(users: Iterable[User], change: Change) -> Iterator[Change]:
    """Run the change inside; then every user in `users` keeps what they'd lose."""
    users = list({user.pk: user for user in users}.values())
    with transaction.atomic():
        before = {user.pk: _look(user) for user in users}
        yield change
        now = timezone.now()
        for user in users:
            change.kept[user.pk] = _keep(user, before[user.pk], change, now)


def would_lose(user: User, change: Callable[[], None]) -> tuple[int, list[Person]]:
    """Try `change` and undo it: how many people the user would lose, and who they'd keep,
    with how much they wrote about each."""
    before = _look(user)
    with transaction.atomic():
        change()
        lost = before.people - _visible(user)
        transaction.set_rollback(True)

    def theirs(relation: str) -> Count:
        return Count(relation, filter=Q(**{f"{relation}__author": user}), distinct=True)

    keeps = Person.objects.filter(pk__in=lost & before.written).annotate(
        note_count=theirs("notes"),
        memory_aid_count=theirs("memory_aids"),
        interaction_count=theirs("interactions"),
    )
    return len(lost), list(keeps.order_by(by_name(), "pk"))


def written_about(user: User) -> set[UUID]:
    """Everyone the user wrote notes, memory aids or timeline entries about."""
    ids: set[UUID] = set()
    for model, author in WRITTEN:
        ids |= set(model.objects.filter(**{author: user}).values_list("person_id", flat=True))
    return ids


def writers_about(person: Person) -> set[UUID]:
    """Everyone who wrote notes, memory aids or timeline entries about `person`."""
    ids: set[UUID] = set()
    for model, author in WRITTEN:
        ids |= set(model.objects.filter(person=person).values_list(f"{author}_id", flat=True))
    return ids


def _visible(user: User) -> set[UUID]:
    return set(visible_people(Access.for_user(user)).values_list("pk", flat=True))


def _look(user: User) -> _Before:
    people = _visible(user)
    written = people & written_about(user)
    contacts = defaultdict(list)
    for method in visible_contact_methods(Access.for_user(user)).filter(person__in=written):
        contacts[method.person_id].append(method)
    return _Before(people, written, contacts)


def _keep(user: User, before: _Before, change: Change, now) -> list[Person]:
    lost = before.people - _visible(user)
    originals = Person.objects.filter(pk__in=lost & before.written).select_related("owner__me")
    copies = {
        original.pk: _copy(user, original, before.contacts[original.pk], change, now)
        for original in originals.prefetch_related("tags")
    }
    for model, author in FOLLOWS:
        for original, copy in copies.items():
            model.objects.filter(**{author: user}, person_id=original).update(person=copy)
    _tidy_links(user, lost, copies)
    reason = change.told.get(user.pk) or (change.reason if copies else None)
    if reason and user.pk != change.by.pk:
        notice = AccessEnded.objects.create(
            user=user,
            reason=reason,
            by=change.by.display_name,
            space=change.space,
            about=change.about,
            lost_count=len(lost),
        )
        notice.kept.set(copies.values())
    return list(copies.values())


def _copy(
    user: User, original: Person, contacts: list[ContactMethod], change: Change, now
) -> Person:
    """The user's own copy of the basic profile, as far as they could see it."""
    copy = Person.objects.create(
        owner=user,
        name=original.name,
        how_we_met=original.how_we_met,
        work=original.work,
        birth_day=original.birth_day,
        birth_month=original.birth_month,
        birth_year=original.birth_year,
        pronouns=original.pronouns,
        photo_caption=original.photo_caption,
        kept_at=now,
        kept_from=original.owner.display_name,
        kept_space=change.space if change.reason != Reason.PERSON_DELETED else "",
    )
    people.set_tags(copy, [tag.name for tag in original.tags.all()])
    ContactMethod.objects.bulk_create(
        ContactMethod(person=copy, kind=m.kind, label=m.label, value=m.value, position=m.position)
        for m in contacts
    )
    if original.photo:
        for name in ("photo", "photo_thumbnail"):
            source = getattr(original, name)
            with source.open("rb") as file:
                getattr(copy, name).save(Path(source.name).name, File(file), save=False)
        copy.save(update_fields=["photo", "photo_thumbnail"])
    return copy


def _tidy_links(user: User, lost: set[UUID], copies: dict[UUID, Person]) -> None:
    """Links the user made, once they can't see some of the people any more.

    Links in a space they no longer see belong to that space: they pass to its owner,
    unless the owner can't see both people either. Their private links follow to
    the copies, and links to anyone they didn't keep are removed.
    """
    access = Access.for_user(user)
    in_lost_spaces = (
        Relationship.objects.filter(owner=user, space__isnull=False)
        .exclude(space__in=visible_spaces(access))
        .select_related("space__owner")
    )
    for link in in_lost_spaces:
        if _space_keeps(link):
            continue
        link.space = None
        link.save(update_fields=["space", "updated_at"])

    touching = Q(person_a__in=lost) | Q(person_b__in=lost)
    for link in Relationship.objects.filter(touching, owner=user, space__isnull=True):
        ends = [link.person_a_id, link.person_b_id]
        if any(end in lost and end not in copies for end in ends):
            link.delete()
            continue
        a, b = (copies.get(end) or Person(pk=end) for end in ends)
        link.person_a, link.person_b = stored_order(link.type, a, b)
        link.save(update_fields=["person_a", "person_b", "updated_at"])


def _space_keeps(link: Relationship) -> bool:
    """Hand a link to its space's owner. False if they couldn't see it."""
    owner = link.space.owner
    ends = [link.person_a_id, link.person_b_id]
    if visible_people(Access.for_user(owner)).filter(pk__in=ends).count() < 2:
        return False
    duplicate = Relationship.objects.filter(
        owner=owner,
        person_a_id=link.person_a_id,
        person_b_id=link.person_b_id,
        type=link.type,
        is_former=False,
    )
    if link.is_former or not duplicate.exists():
        link.owner = owner
        link.save(update_fields=["owner", "updated_at"])
    else:
        link.delete()  # the owner already has the same link
    return True
