"""Importing contacts from a .vcf: a preview that stores nothing, then the import itself
from the same file plus the user's choices."""

from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import UploadedFile

from access.policy import Access, can_import
from imports.matching import Match, find_matches
from imports.schemas import ContactOut, DetailOut, MatchOut, PreviewOut
from imports.vcard import Card, NotAVcard, read
from people.models import ContactMethod
from people.schemas import photo_of

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
