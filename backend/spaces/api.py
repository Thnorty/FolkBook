from uuid import UUID

from django.db.models import Count, QuerySet
from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import Access, visible_people, visible_spaces, visible_spaces_with_role
from core.api import access_for
from core.db import by_name
from spaces import services
from spaces.models import Space
from spaces.schemas import SpaceIn, SpaceOut, SpacePatch, SpacePersonIn

router = Router(tags=["spaces"])


def spaces_for(access: Access) -> QuerySet[Space]:
    """Visible spaces with what SpaceOut needs, in name order."""
    return (
        visible_spaces_with_role(access)
        .select_related("owner__me")
        .annotate(
            people_count=Count("people", distinct=True),
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
