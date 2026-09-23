from uuid import UUID

from django.db.models import (
    BooleanField,
    ExpressionWrapper,
    OuterRef,
    Prefetch,
    Q,
    QuerySet,
    Subquery,
)
from django.shortcuts import get_object_or_404
from ninja import Router, Status
from ninja.pagination import PageNumberPagination, paginate

from access.policy import (
    Access,
    can_delete_person,
    can_edit_person,
    visible_contact_methods,
    visible_interactions,
    visible_memory_aids,
    visible_notes,
    visible_people,
    visible_spaces,
)
from core.api import access_for
from core.db import by_name
from people import services
from people.models import Person
from people.schemas import (
    MemoryAidIn,
    MemoryAidOut,
    MemoryAidPatch,
    NoteIn,
    NoteOut,
    PersonDetailOut,
    PersonIn,
    PersonOut,
    PersonPatch,
)
from people.search import search_people
from relationships.family import family_of
from relationships.schemas import FamilyRelationOut

router = Router(tags=["people"])
memory_aids_router = Router(tags=["memory aids"])


# Imported or added in a hurry: nobody wrote down how you know them. Not your own Me.
NEEDS_DETAILS = ExpressionWrapper(Q(how_we_met="", account__isnull=True), BooleanField())


def people_for(access: Access) -> QuerySet[Person]:
    """Visible people with what PersonOut needs, in name order."""
    last_talked = (
        visible_interactions(access).filter(person=OuterRef("pk")).order_by("-occurred_on")
    )
    return (
        visible_people(access)
        .annotate(
            needs_details=NEEDS_DETAILS,
            last_talked_on=Subquery(last_talked.values("occurred_on")[:1]),
        )
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
    """Everyone the user can see, by name. `needs_details`: no "how we met" yet.

    `search` matches names, how you met, work, tags, spaces and your own notes and
    memory aids, ignoring case and accents.
    """
    access = access_for(request)
    people = people_for(access)
    if space:
        people = people.filter(spaces__in=visible_spaces(access).filter(pk=space))
    if needs_details:
        people = people.filter(needs_details=True)
    return search_people(access, people, search)


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


# ---------------------------------------------------------------- notes (private)


@router.get("/{person_id}/note", response=NoteOut)
def get_note(request, person_id: UUID):
    """The user's own notes on this person (empty if none)."""
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    note = visible_notes(access).filter(person=person).first()
    return note or {"body": "", "updated_at": None}


@router.put("/{person_id}/note", response=NoteOut)
def save_note(request, person_id: UUID, payload: NoteIn):
    """Replace the user's notes on this person. Empty text removes them."""
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=person_id)
    note = services.save_note(access, person, payload.body)
    return note or {"body": "", "updated_at": None}


# ---------------------------------------------------------------- memory aids (private)


def visible_aid(access, aid_id: UUID):
    return get_object_or_404(visible_memory_aids(access).select_related("person"), pk=aid_id)


@memory_aids_router.get("", response=list[MemoryAidOut])
@paginate(PageNumberPagination, page_size=50)
def list_memory_aids(request, person: UUID | None = None):
    """The user's own sticky notes, pinned first; `person` narrows to one person."""
    aids = visible_memory_aids(access_for(request))
    return aids.filter(person=person) if person else aids


@memory_aids_router.post("", response={201: MemoryAidOut})
def create_memory_aid(request, payload: MemoryAidIn):
    access = access_for(request)
    person = get_object_or_404(visible_people(access), pk=payload.person_id)
    data = payload.model_dump(include={"text", "pinned"})
    return Status(201, services.create_memory_aid(access, person, data))


@memory_aids_router.patch("/{aid_id}", response=MemoryAidOut)
def update_memory_aid(request, aid_id: UUID, payload: MemoryAidPatch):
    access = access_for(request)
    changes = payload.model_dump(exclude_unset=True)
    return services.update_memory_aid(access, visible_aid(access, aid_id), changes)


@memory_aids_router.delete("/{aid_id}", response={204: None})
def delete_memory_aid(request, aid_id: UUID):
    access = access_for(request)
    services.delete_memory_aid(access, visible_aid(access, aid_id))
    return Status(204, None)
