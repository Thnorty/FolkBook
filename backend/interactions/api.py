from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import Access, visible_interactions, visible_people
from core.api import access_for
from interactions import services
from interactions.models import Interaction
from interactions.schemas import InteractionIn, InteractionOut, InteractionPatch

router = Router(tags=["timeline"])


def visible_interaction(access: Access, interaction_id: UUID) -> Interaction:
    return get_object_or_404(
        visible_interactions(access).select_related("person"), pk=interaction_id
    )


@router.get("", response=list[InteractionOut])
@paginate(PageNumberPagination, page_size=50)
def list_interactions(request, person: UUID | None = None):
    """The user's own timeline, newest first; `person` narrows to one person."""
    interactions = visible_interactions(access_for(request))
    return interactions.filter(person=person) if person else interactions


@router.post("", response={201: InteractionOut})
def log_interaction(request, payload: InteractionIn):
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=payload.person_id)
    data = payload.model_dump(exclude={"person_id"})
    return Status(201, services.log_interaction(access, person, data))


@router.patch("/{interaction_id}", response=InteractionOut)
def update_interaction(request, interaction_id: UUID, payload: InteractionPatch):
    access = access_for(request)
    return services.update_interaction(
        access, visible_interaction(access, interaction_id), payload.model_dump(exclude_unset=True)
    )


@router.delete("/{interaction_id}", response={204: None})
def delete_interaction(request, interaction_id: UUID):
    access = access_for(request)
    services.delete_interaction(access, visible_interaction(access, interaction_id))
    return Status(204, None)
