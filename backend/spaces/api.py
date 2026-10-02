from uuid import UUID

from django.db.models import Count, Q, QuerySet
from django.shortcuts import get_object_or_404
from ninja import Query, Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import (
    Access,
    hidden_people,
    visible_people,
    visible_spaces,
    visible_spaces_with_role,
)
from accounts.models import User
from core.api import access_for
from core.db import by_name
from people.schemas import PersonRef
from spaces import services
from spaces.models import Space
from spaces.schemas import (
    AccountOut,
    CandidateParams,
    LeavePreviewOut,
    LeftOut,
    MemberOut,
    RoleIn,
    ShareIn,
    SpaceIn,
    SpaceOut,
    SpacePatch,
    SpacePersonIn,
)

router = Router(tags=["spaces"])


def spaces_for(access: Access) -> QuerySet[Space]:
    """Visible spaces with what SpaceOut needs, in name order."""
    return (
        visible_spaces_with_role(access)
        .select_related("owner__me")
        .annotate(
            people_count=Count("people", filter=Q(people__deleted_at__isnull=True), distinct=True),
            member_count=Count("memberships", distinct=True),
        )
        .order_by(by_name(), "pk")
    )


def visible_space(access: Access, space_id: UUID) -> Space:
    return get_object_or_404(visible_spaces(access), pk=space_id)


@router.get("", response=list[SpaceOut])
@paginate(PageNumberPagination, page_size=50)
def list_spaces(request):
    return spaces_for(access_for(request))


@router.get("/{space_id}", response=SpaceOut)
def get_space(request, space_id: UUID):
    return get_object_or_404(spaces_for(access_for(request)), pk=space_id)


@router.post("", response={201: SpaceOut})
def create_space(request, payload: SpaceIn):
    access = access_for(request)
    space = services.create_space(access, payload.model_dump())
    return Status(201, spaces_for(access).get(pk=space.pk))


@router.patch("/{space_id}", response=SpaceOut)
def update_space(request, space_id: UUID, payload: SpacePatch):
    access = access_for(request)
    services.update_space(
        access, visible_space(access, space_id), payload.model_dump(exclude_unset=True)
    )
    return spaces_for(access).get(pk=space_id)


@router.delete("/{space_id}", response={204: None})
def delete_space(request, space_id: UUID):
    access = access_for(request)
    services.delete_space(access, visible_space(access, space_id))
    return Status(204, None)


@router.post("/{space_id}/people", response={204: None})
def add_person(request, space_id: UUID, payload: SpacePersonIn):
    """Put a person in a space. Adding someone who's already there does nothing."""
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=payload.person_id)
    services.add_person(access, visible_space(access, space_id), person)
    return Status(204, None)


@router.delete("/{space_id}/people/{person_id}", response={204: None})
def remove_person(request, space_id: UUID, person_id: UUID):
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    services.remove_person(access, visible_space(access, space_id), person)
    return Status(204, None)


@router.get("/{space_id}/hidden-people", response=list[PersonRef])
@paginate(PageNumberPagination, page_size=50)
def list_hidden_people(request, space_id: UUID):
    """People in this space that you took out of your book, to add back."""
    access = access_for(request)
    space = visible_space(access, space_id)
    return hidden_people(access).filter(spaces=space).order_by(by_name(), "pk")


# ---------------------------------------------------------------- members


def _member_out(request, user, role: str) -> dict:
    return {
        "user_id": user.pk,
        "name": user.display_name,
        "email": user.email,
        "role": role,
        "is_you": user.pk == request.auth.pk,
    }


@router.get("/{space_id}/members", response=list[MemberOut])
def list_members(request, space_id: UUID):
    """Who can see this space: the owner, then members with their roles."""
    space = visible_space(access_for(request), space_id)
    return [_member_out(request, m["user"], m["role"]) for m in services.members_of(space)]


@router.get("/{space_id}/share-candidates", response=list[AccountOut])
def share_candidates(request, space_id: UUID, params: Query[CandidateParams]):
    """Accounts on this server to share with: owner only, a name or email to search."""
    access = access_for(request)
    users = services.people_to_share_with(access, visible_space(access, space_id), params.q)
    return [_member_out(request, user, "") for user in users]


@router.post("/{space_id}/members", response={201: MemberOut})
def share_space(request, space_id: UUID, payload: ShareIn):
    """Share the space with an account on this server, as a viewer or editor."""
    access = access_for(request)
    space = visible_space(access, space_id)
    user = get_object_or_404(User, pk=payload.user_id)
    membership = services.share_with(access, space, user, payload.role)
    return Status(201, _member_out(request, user, membership.role))


@router.patch("/{space_id}/members/{uuid:user_id}", response=MemberOut)
def change_member_role(request, space_id: UUID, user_id: UUID, payload: RoleIn):
    access = access_for(request)
    space = visible_space(access, space_id)
    membership = get_object_or_404(space.memberships.select_related("user__me"), user_id=user_id)
    services.change_role(access, membership, payload.role)
    return _member_out(request, membership.user, membership.role)


@router.delete("/{space_id}/members/{uuid:user_id}", response={204: None})
def remove_member(request, space_id: UUID, user_id: UUID):
    """The owner removes a member. They keep copies of anyone they wrote about."""
    access = access_for(request)
    space = visible_space(access, space_id)
    membership = get_object_or_404(space.memberships.select_related("user__me"), user_id=user_id)
    services.remove_member(access, membership)
    return Status(204, None)


@router.post("/{space_id}/stop-sharing", response={204: None})
def stop_sharing(request, space_id: UUID):
    """The owner removes every member: the space is private again."""
    access = access_for(request)
    services.stop_sharing(access, visible_space(access, space_id))
    return Status(204, None)


@router.get("/{space_id}/leave-preview", response=LeavePreviewOut)
def leave_preview(request, space_id: UUID):
    """What leaving would do: who you'd keep a copy of, and how many others would go."""
    access = access_for(request)
    lost, kept, own = services.what_leaving_loses(access, visible_space(access, space_id))
    return {"kept": kept, "leaving": lost - len(kept), "own_people": own}


@router.post("/{space_id}/leave", response=LeftOut)
def leave_space(request, space_id: UUID):
    """Stop seeing a space shared with you. Copies of anyone you wrote about stay."""
    access = access_for(request)
    return {"kept": services.leave(access, visible_space(access, space_id))}
