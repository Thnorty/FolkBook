from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import Router

from access.policy import visible_keep_in_touch, visible_people
from core.api import access_for
from reminders import services
from reminders.schemas import KeepInTouchSchema

router = Router(tags=["reminders"])


@router.get("/{person_id}", response=KeepInTouchSchema)
def get_keep_in_touch(request, person_id: UUID):
    """The user's own setting; defaults when there is none yet."""
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    return visible_keep_in_touch(access).filter(person=person).first() or KeepInTouchSchema()


@router.put("/{person_id}", response=KeepInTouchSchema)
def save_keep_in_touch(request, person_id: UUID, payload: KeepInTouchSchema):
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    return services.save_keep_in_touch(access, person, payload.model_dump())
