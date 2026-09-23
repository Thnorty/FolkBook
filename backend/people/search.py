"""Searching people: what the People list's search box matches."""

from django.db.models import Exists, OuterRef, Q, QuerySet

from access.policy import Access, visible_memory_aids, visible_notes, visible_spaces
from people.models import Person, Tag


def search_people(access: Access, people: QuerySet[Person], text: str) -> QuerySet[Person]:
    """People matching every word of `text`, ignoring case and accents (Yılmaz = yilmaz).

    A word matches a person's name, how you met, work, tags, the spaces you can see
    them in, or your own notes and memory aids about them (never anyone else's).
    """
    for word in text.split():
        people = people.filter(_matches(access, word))
    return people


def _matches(access: Access, word: str) -> Q:
    def contains(field: str) -> Q:
        return Q(**{f"{field}__unaccent__icontains": word})

    def about_person(queryset: QuerySet, field: str) -> Exists:
        return Exists(queryset.filter(contains(field), person=OuterRef("pk")))

    return (
        contains("name")
        | contains("how_we_met")
        | contains("work")
        | Exists(Tag.objects.filter(contains("name"), people=OuterRef("pk")))
        | Exists(visible_spaces(access).filter(contains("name"), people=OuterRef("pk")))
        | about_person(visible_notes(access), "body")
        | about_person(visible_memory_aids(access), "text")
    )
