"""Invite links and the first-run setup: the only ways to get an account."""

import datetime

from django.core.exceptions import PermissionDenied
from django.db import connection, transaction
from django.db.models import QuerySet
from django.http import HttpRequest
from django.utils import timezone

from access.policy import Access, can_manage_space
from accounts.models import User
from accounts.services import create_account
from core.api import Conflict
from invites.models import Invite
from spaces.models import Space, SpaceMembership

# Any number that identifies this lock; only first-run setup takes it.
_FIRST_RUN_LOCK = 7_417_001


class InviteUnusable(Exception):
    """Unknown, expired or used up. One answer for all three, so links can't be probed."""


# ---------------------------------------------------------------- first run


def setup_needed() -> bool:
    return not User.objects.exists()


@transaction.atomic
def first_run(request: HttpRequest, email: str, password: str, name: str) -> User:
    """Create the server's first account, as its admin. Only while there are no users."""
    with connection.cursor() as cursor:
        # Two simultaneous first-run requests must not both create an admin.
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [_FIRST_RUN_LOCK])
    if not setup_needed():
        raise PermissionDenied("This FolkBook is already set up. Log in instead.")
    return create_account(request, email, password, name, admin=True)


# ---------------------------------------------------------------- invite links


def visible_invites(user: User) -> QuerySet[Invite]:
    """Admins see every invite on the server; everyone else sees their own."""
    invites = Invite.objects.select_related("created_by__me", "space").order_by("-created_at")
    return invites if user.is_staff else invites.filter(created_by=user)


def create_invite(
    access: Access,
    expires_in_days: int,
    max_uses: int,
    space: Space | None = None,
    role: str = SpaceMembership.Role.VIEWER,
) -> Invite:
    if access.read_only:
        raise PermissionDenied("This access can't create invites.")
    if space is not None and not can_manage_space(access, space):
        raise PermissionDenied("Only the space's owner can invite people into it.")
    if space is None and not access.user.is_staff:
        raise PermissionDenied("Only admins can invite people without a space.")
    return Invite.objects.create(
        created_by=access.user,
        expires_at=timezone.now() + datetime.timedelta(days=expires_in_days),
        max_uses=max_uses,
        space=space,
        role=role,
    )


def revoke_invite(user: User, invite: Invite) -> None:
    if not (user.is_staff or invite.created_by_id == user.pk):
        raise PermissionDenied("Only the person who made this invite can revoke it.")
    invite.delete()


def usable_invite(token: str, lock: bool = False) -> Invite:
    invites = Invite.objects.select_related("created_by__me", "space")
    if lock:
        invites = invites.select_for_update(of=("self",))
    invite = invites.filter(token=token).first()
    if invite is None or not invite.is_usable:
        raise InviteUnusable
    return invite


@transaction.atomic
def accept_invite(request: HttpRequest, token: str, email: str, password: str, name: str) -> User:
    """Sign up with an invite: a new account, joined to the invite's space if it has one."""
    invite = usable_invite(token, lock=True)
    user = create_account(request, email, password, name)
    _use(invite, user)
    return user


@transaction.atomic
def join_with_invite(user: User, token: str) -> Space:
    """An existing user follows an invite that shares a space: they join the space."""
    invite = usable_invite(token, lock=True)
    if invite.space is None:
        raise Conflict("You already have an account. This invite is for new people.")
    if invite.space.owner_id == user.pk or invite.space.memberships.filter(user=user).exists():
        raise Conflict(f"You're already in {invite.space.name}.")
    _use(invite, user)
    return invite.space


def _use(invite: Invite, user: User) -> None:
    if invite.space is not None:
        SpaceMembership.objects.create(space=invite.space, user=user, role=invite.role)
    invite.uses += 1
    invite.save(update_fields=["uses", "updated_at"])
