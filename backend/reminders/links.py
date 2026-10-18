"""The links in reminder emails that work without logging in: Unsubscribe and "We talked".

They're signed with the server's secret, so nobody can make one for someone else. Opening
one only shows a page; the change happens when the user confirms it there (email
scanners open links). "We talked" asks the permission layer again when it's used.
"""

import datetime

from django.core import signing

from access.policy import Access, can_write_private, visible_people
from accounts.models import User
from people.models import Person

UNSUBSCRIBE = "folkbook.reminders.unsubscribe"
TALKED = "folkbook.reminders.we-talked"
# A digest is old news after a couple of weeks.
TALKED_LINK_LASTS = datetime.timedelta(days=14)


def unsubscribe_token(user: User) -> str:
    return signing.dumps(str(user.pk), salt=UNSUBSCRIBE, compress=True)


def unsubscribing(token: str) -> User | None:
    """Whose emails this link stops (it never runs out), or None for a broken link."""
    try:
        user_id = signing.loads(token, salt=UNSUBSCRIBE)
    except signing.BadSignature:
        return None
    return User.objects.filter(pk=user_id).first()


def talked_token(user: User, person: Person) -> str:
    return signing.dumps([str(user.pk), str(person.pk)], salt=TALKED, compress=True)


def talked(token: str) -> tuple[Access, Person] | None:
    """Who talked to whom, while the user can still write about that person; else None."""
    try:
        user_id, person_id = signing.loads(
            token, salt=TALKED, max_age=TALKED_LINK_LASTS.total_seconds()
        )
    except (signing.BadSignature, ValueError):
        return None
    user = User.objects.filter(pk=user_id, is_active=True).first()
    if user is None:
        return None
    access = Access.for_user(user)
    person = visible_people(access).filter(pk=person_id).first()
    if person is None or not can_write_private(access, person):
        return None
    return access, person
