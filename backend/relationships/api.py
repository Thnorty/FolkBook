from uuid import UUID

from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import Access, visible_people, visible_relationships, visible_spaces
from core.api import access_for
from relationships import services
from relationships.models import FAMILY_TYPES, Relationship
from relationships.schemas import EndIn, RelationshipIn, RelationshipOut, RelationshipPatch

router = Router(tags=["relationships"])


def links_for(access: Access) -> QuerySet[Relationship]:
    return (
        visible_relationships(access)
        .select_related("person_a", "person_b", "space")
        .order_by("type", "created_at", "pk")
    )


def visible_link(access: Access, link_id: UUID) -> Relationship:
    return get_object_or_404(links_for(access), pk=link_id)


@router.get("", response=list[RelationshipOut])
@paginate(PageNumberPagination, page_size=50)
def list_relationships(request, person: UUID | None = None, family: bool | None = None):
    """Stored links the user can see; `person` narrows to that person's links."""
    links = links_for(access_for(request))
    if person:
        links = links.filter(Q(person_a=person) | Q(person_b=person))
    if family is not None:
        in_family = Q(type__in=sorted(FAMILY_TYPES))
        links = links.filter(in_family if family else ~in_family)
    return links


@router.get("/{link_id}", response=RelationshipOut)
def get_relationship(request, link_id: UUID):
    return visible_link(access_for(request), link_id)


@router.post("", response={201: RelationshipOut})
def create_relationship(request, payload: RelationshipIn):
    access = access_for(request)
    people = visible_people(access)
    a = get_object_or_404(people, pk=payload.person_a_id)
    b = get_object_or_404(people, pk=payload.person_b_id)
    space = (
        get_object_or_404(visible_spaces(access), pk=payload.space_id) if payload.space_id else None
    )
    data = payload.model_dump(include={"type", "parent_type", "label", "started_on"})
    data["parent_type"] = data["parent_type"] or ""
    link = services.create_relationship(access, a, b, space, data)
    return Status(201, visible_link(access, link.pk))


@router.patch("/{link_id}", response=RelationshipOut)
def update_relationship(request, link_id: UUID, payload: RelationshipPatch):
    access = access_for(request)
    changes = payload.model_dump(exclude_unset=True)
    if "parent_type" in changes:
        changes["parent_type"] = changes["parent_type"] or ""
    services.update_relationship(access, visible_link(access, link_id), changes)
    return visible_link(access, link_id)


@router.post("/{link_id}/end", response=RelationshipOut)
def end_relationship(request, link_id: UUID, payload: EndIn):
    """Mark a link as former (e.g. a divorce). Parent links never end."""
    access = access_for(request)
    services.end_relationship(access, visible_link(access, link_id), payload.ended_on)
    return visible_link(access, link_id)


@router.post("/{link_id}/reopen", response=RelationshipOut)
def reopen_relationship(request, link_id: UUID):
    access = access_for(request)
    services.reopen_relationship(access, visible_link(access, link_id))
    return visible_link(access, link_id)


@router.delete("/{link_id}", response={204: None})
def delete_relationship(request, link_id: UUID):
    access = access_for(request)
    services.delete_relationship(access, visible_link(access, link_id))
    return Status(204, None)
