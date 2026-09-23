from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import visible_spaces
from accounts.schemas import CurrentUserOut
from core.api import ErrorOut, access_for, require_csrf
from invites import services
from invites.schemas import InviteIn, InviteOut, InvitePreviewOut, SetupStatusOut, SignUpIn
from people.schemas import SpaceRef

router = Router(tags=["invites"])
setup_router = Router(tags=["setup"])

UNUSABLE = {"detail": "This invite link has expired or doesn't exist."}


# ---------------------------------------------------------------- first run


@setup_router.get("", response=SetupStatusOut, auth=None)
def setup_status(request):
    """Whether this server still needs its first account (the app shows setup)."""
    return {"needed": services.setup_needed()}


@setup_router.post("", response={201: CurrentUserOut}, auth=None)
def first_run(request, payload: SignUpIn):
    """Create the first account, as the server's admin, and log in."""
    require_csrf(request)
    user = services.first_run(request, payload.email, payload.password, payload.name)
    return Status(201, user)


# ---------------------------------------------------------------- managing invites


@router.get("", response=list[InviteOut])
@paginate(PageNumberPagination, page_size=50)
def list_invites(request):
    """Your invites; admins see every invite on the server."""
    return services.visible_invites(request.auth)


@router.post("", response={201: InviteOut})
def create_invite(request, payload: InviteIn):
    """Admins can invite anyone; anyone can invite people into a space they own."""
    access = access_for(request)
    space = (
        get_object_or_404(visible_spaces(access), pk=payload.space_id) if payload.space_id else None
    )
    invite = services.create_invite(
        access, payload.expires_in_days, payload.max_uses, space, payload.role
    )
    return Status(201, services.visible_invites(request.auth).get(pk=invite.pk))


@router.delete("/{uuid:invite_id}", response={204: None})
def revoke_invite(request, invite_id: UUID):
    invite = get_object_or_404(services.visible_invites(request.auth), pk=invite_id)
    services.revoke_invite(request.auth, invite)
    return Status(204, None)


# ---------------------------------------------------------------- using an invite


@router.get("/by-token/{token}", response={200: InvitePreviewOut, 404: ErrorOut}, auth=None)
def preview_invite(request, token: str):
    try:
        invite = services.usable_invite(token)
    except services.InviteUnusable:
        return Status(404, UNUSABLE)
    inviter = getattr(invite.created_by, "me", None)
    return {
        "invited_by": inviter.name if inviter else invite.created_by.email,
        "expires_at": invite.expires_at,
        "space": invite.space,
        "space_people_count": invite.space.people.count() if invite.space else None,
        "role": invite.role,
    }


@router.post("/by-token/{token}/accept", response={201: CurrentUserOut, 404: ErrorOut}, auth=None)
def accept_invite(request, token: str, payload: SignUpIn):
    """Create an account with the invite and log in."""
    require_csrf(request)
    try:
        user = services.accept_invite(request, token, payload.email, payload.password, payload.name)
    except services.InviteUnusable:
        return Status(404, UNUSABLE)
    return Status(201, user)


@router.post("/by-token/{token}/join", response={200: SpaceRef, 404: ErrorOut})
def join_with_invite(request, token: str):
    """Already have an account? Join the invite's space with it."""
    try:
        return services.join_with_invite(request.auth, token)
    except services.InviteUnusable:
        return Status(404, UNUSABLE)
