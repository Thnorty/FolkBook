"""Importing contacts from a .vcf: a preview that stores nothing, then the import itself
from the same file plus the user's choices."""

from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.shortcuts import get_object_or_404

from access.policy import (
    Access,
    can_change_space_people,
    can_import,
    visible_people,
    visible_spaces,
)
from accounts.models import User
from imports.matching import Match, find_matches, phone_key
from imports.models import Import, Merge
from imports.schemas import (
    ChoicesIn,
    ContactOut,
    DetailOut,
    ImportOut,
    MatchOut,
    PickIn,
    PreviewOut,
)
from imports.vcard import Card, Detail, NotAVcard, read
from people.models import ContactMethod, Note, Person
from people.schemas import photo_of
from people.services import photo_files, store_photo
from spaces.models import Space, SpacePerson

CHOOSE_AGAIN = "go back and choose again."

MAX_FILE_MB = 20
MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024
MAX_CONTACTS = 5000


def preview(access: Access, upload: UploadedFile) -> PreviewOut:
    """The contacts in the file, each with who they may already be. Changes nothing."""
    _check_can_import(access)
    cards, skipped = read_upload(upload)
    matches = find_matches(access, cards)
    return PreviewOut(
        file_name=upload.name or "",
        contacts=[
            _contact_out(index, card, match)
            for index, (card, match) in enumerate(zip(cards, matches, strict=True))
        ],
        skipped=skipped,
    )


def run_import(access: Access, upload: UploadedFile, choices: ChoicesIn) -> ImportOut:
    """Add the picked contacts as new people (in `choices.space`, if any) and merge the
    others into who they matched, all at once: if anything fails, nothing changes."""
    _check_can_import(access)
    cards, _ = read_upload(upload)
    space = _space_for_new_people(access, choices.space)
    picks = _checked(access, choices.picked, cards, find_matches(access, cards))
    user = access.user
    stored: list[str] = []  # new photo files, to remove if anything fails
    try:
        with transaction.atomic():
            batch = Import.objects.create(owner=user, file_name=(upload.name or "")[:255])
            new_cards = [card for card, pick, _ in picks if pick.action == "new"]
            added = _add(user, new_cards, batch, stored)
            if space:
                SpacePerson.objects.bulk_create(
                    SpacePerson(space=space, person=person, added_by=user) for person in added
                )
            merges = [(card, match) for card, pick, match in picks if pick.action == "merge"]
            for card, match in merges:
                merge_into(match.person, card, user, batch, stored)
    except BaseException:
        for name in stored:
            default_storage.delete(name)
        raise
    return ImportOut(
        import_id=batch.pk,
        added=len(added),
        merged=len(merges),
        left_out=len(cards) - len(added) - len(merges),
        space=space,
    )


def merge_into(person: Person, card: Card, user: User, batch: Import, stored: list[str]) -> None:
    """Add to `person` what the card has and they don't, and record what that was, so the
    import can be undone. Overwrites nothing."""
    methods = list(person.contact_methods.all())
    phones = {_phone(m.value) for m in methods if m.kind == ContactMethod.ContactKind.PHONE}
    emails = {_email(m.value) for m in methods if m.kind == ContactMethod.ContactKind.EMAIL}
    new_phones = [d for d in card.phones if _phone(d.value) not in phones]
    new_emails = [d for d in card.emails if _email(d.value) not in emails]
    start = max((m.position for m in methods), default=-1) + 1
    added = _contact_methods(person, new_phones, new_emails, start)
    for method in added:
        method.added_by_import = batch
    ContactMethod.objects.bulk_create(added)
    filled: dict = {}
    if not person.work and card.work:
        person.work = filled["work"] = card.work
    if card.birthday and person.birth_day is None:
        person.birth_day, person.birth_month, person.birth_year = card.birthday
        filled["birthday"] = list(card.birthday)
    if card.photo and not person.photo:
        _store_photo(person, card, stored)
        filled["photo"] = person.photo.name
    person.save()
    appended = ""
    if card.note:
        note, created = Note.objects.get_or_create(
            author=user, person=person, defaults={"body": card.note}
        )
        appended = card.note if created else f"\n\n{card.note}"
        if not created:
            note.body += appended
            note.save(update_fields=["body", "updated_at"])
    Merge.objects.create(batch=batch, person=person, filled=filled, note=appended)


def read_upload(upload: UploadedFile) -> tuple[list[Card], int]:
    upload.seek(0)
    data = upload.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise _refusal(f"That file is too big (up to {MAX_FILE_MB} MB).")
    try:
        cards, skipped = read(data)
    except NotAVcard:
        raise _refusal("That file isn't a .vcf contacts file.") from None
    if len(cards) > MAX_CONTACTS:
        raise _refusal(f"That file has more than {MAX_CONTACTS:,} contacts.")
    return cards, skipped


def _check_can_import(access: Access) -> None:
    if not can_import(access):
        raise PermissionDenied("This access can't import contacts.")


def _refusal(message: str) -> ValidationError:
    return ValidationError({"file": message})


def _contact_out(index: int, card: Card, match: Match | None) -> ContactOut:
    day_month_year = card.birthday
    return ContactOut(
        index=index,
        name=card.name,
        phones=[DetailOut(value=d.value, label=d.label) for d in card.phones],
        emails=[DetailOut(value=d.value, label=d.label) for d in card.emails],
        birthday=dict(zip(("day", "month", "year"), day_month_year, strict=True))
        if day_month_year
        else None,
        work=card.work,
        has_photo=card.photo is not None,
        match=_match_out(match) if match else None,
    )


def _match_out(match: Match) -> MatchOut:
    person = match.person

    def details(kind: str) -> list[str]:
        return [method.value for method in person.shown if method.kind == kind]

    return MatchOut(
        person={"id": person.pk, "name": person.name},
        owner=person.owner.display_name,
        photo=photo_of(person),
        phones=details(ContactMethod.ContactKind.PHONE),
        emails=details(ContactMethod.ContactKind.EMAIL),
        spaces=person.spaces_shown,
        reason=match.reason,
        sure=match.sure,
        can_merge=match.can_merge,
        by_details=match.by_details,
    )


def _space_for_new_people(access: Access, space_id) -> Space | None:
    if space_id is None:
        return None
    space = get_object_or_404(visible_spaces(access), pk=space_id)
    if not can_change_space_people(access, space):
        raise PermissionDenied("You can't add people to this space.")
    return space


def _checked(
    access: Access, picked: list[PickIn], cards: list[Card], matches: list[Match | None]
) -> list[tuple[Card, PickIn, Match | None]]:
    """The picks that add or merge someone, each checked against the file as it is now."""
    indexes = [pick.index for pick in picked]
    if len(set(indexes)) != len(indexes) or not all(0 <= i < len(cards) for i in indexes):
        raise _choice_error(f"Those choices don't fit this file; {CHOOSE_AGAIN}")
    checked = []
    for pick in picked:
        card, match = cards[pick.index], matches[pick.index]
        if pick.action == "merge":
            if pick.into is None:
                raise _choice_error(f"Who should {card.name} be merged into? {CHOOSE_AGAIN}")
            if not visible_people(access).filter(pk=pick.into).exists():
                raise _choice_error(f"{card.name} isn't in your book any more; {CHOOSE_AGAIN}")
            if not match or match.person.pk != pick.into or not match.can_merge:
                raise _choice_error(f"{card.name} can't be merged there; {CHOOSE_AGAIN}")
        if pick.action != "skip":
            checked.append((card, pick, match))
    return checked


def _add(user: User, cards: list[Card], batch: Import, stored: list[str]) -> list[Person]:
    people = []
    for card in cards:
        day, month, year = card.birthday or (None, None, None)
        person = Person(
            owner=user,
            name=card.name,
            work=card.work,
            birth_day=day,
            birth_month=month,
            birth_year=year,
            added_by_import=batch,
        )
        if card.photo:
            _store_photo(person, card, stored)
        people.append(person)
    Person.objects.bulk_create(people)
    pairs = list(zip(people, cards, strict=True))
    ContactMethod.objects.bulk_create(
        method
        for person, card in pairs
        for method in _contact_methods(person, card.phones, card.emails, 0)
    )
    Note.objects.bulk_create(
        Note(author=user, person=person, body=card.note) for person, card in pairs if card.note
    )
    return people


def _contact_methods(
    person: Person, phones: list[Detail], emails: list[Detail], start: int
) -> list[ContactMethod]:
    details = [(ContactMethod.ContactKind.PHONE, d) for d in phones]
    details += [(ContactMethod.ContactKind.EMAIL, d) for d in emails]
    return [
        ContactMethod(person=person, kind=kind, label=d.label, value=d.value, position=start + i)
        for i, (kind, d) in enumerate(details)
    ]


def _phone(value: str) -> str:
    """Compared like matching does; numbers too short to match compare as written."""
    return phone_key(value) or value.strip()


def _email(value: str) -> str:
    return value.strip().casefold()


def _store_photo(person: Person, card: Card, stored: list[str]) -> None:
    try:
        store_photo(person, ContentFile(card.photo, name="photo"))
    except ValidationError:
        raise _refusal(f"{card.name}'s photo can't be read.") from None
    stored.extend(photo_files(person))


def _choice_error(message: str) -> ValidationError:
    return ValidationError({"choices": message})
