from uuid import UUID

from django.db.models import Prefetch, QuerySet
from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import (
    Access,
    can_delete_person,
    can_edit_person,
    visible_contact_methods,
    visible_people,
    visible_spaces,
)
from core.api import access_for
from core.db import by_name
from people import services
from people.models import Person
from people.schemas import PersonDetailOut, PersonIn, PersonOut, PersonPatch
from relationships.family import family_of
from relationships.schemas import FamilyRelationOut

router = Router(tags=["people"])


def people_for(access: Access) -> QuerySet[Person]:
    """Visible people with what PersonOut needs, in name order."""
    return (
        visible_people(access)
        .select_related("owner__me")
        .prefetch_related(
            "tags",
            Prefetch(
                "spaces",
                queryset=visible_spaces(access).order_by(by_name()),
                to_attr="shown_spaces",
            ),
        )
        .order_by(by_name(), "pk")
    )


def detail(access: Access, person_id: UUID) -> Person:
    """A visible person with the extra fields of PersonDetailOut. 404 if not visible."""
    person = get_object_or_404(people_for(access), pk=person_id)
    person.contact_methods_shown = list(visible_contact_methods(access).filter(person=person))
    person.can_edit = can_edit_person(access, person)
    person.can_delete = can_delete_person(access, person)
    return person


@router.get("", response=list[PersonOut])
@paginate(PageNumberPagination, page_size=50)
def list_people(request, space: UUID | None = None, needs_details: bool = False, search: str = ""):
    """Everyone the user can see, by name. `needs_details`: no "how we met" yet."""
    access = access_for(request)
    people = people_for(access)
    if space:
        people = people.filter(spaces__in=visible_spaces(access).filter(pk=space))
    if needs_details:
        people = people.filter(how_we_met="", account__isnull=True)
    if search.strip():
        people = people.filter(name__icontains=search.strip())
    return people


@router.get("/{person_id}", response=PersonDetailOut)
def get_person(request, person_id: UUID):
    return detail(access_for(request), person_id)


@router.get("/{person_id}/family", response=list[FamilyRelationOut])
def get_family(request, person_id: UUID):
    """Parents, siblings, cousins, in-laws, …, from the links the user can see."""
    access = access_for(request)
    return family_of(access, get_object_or_404(visible_people(access), pk=person_id))


@router.post("", response={201: PersonDetailOut})
def create_person(request, payload: PersonIn):
    access = access_for(request)
    person = services.create_person(access, payload.model_dump())
    return Status(201, detail(access, person.pk))


@router.patch("/{person_id}", response=PersonDetailOut)
def update_person(request, person_id: UUID, payload: PersonPatch):
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    services.update_person(access, person, payload.model_dump(exclude_unset=True))
    return detail(access, person.pk)


@router.delete("/{person_id}", response={204: None})
def delete_person(request, person_id: UUID):
    access = access_for(request)
    services.delete_person(access, get_object_or_404(visible_people(access), pk=person_id))
    return Status(204, None)
