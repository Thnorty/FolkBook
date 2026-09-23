import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from interactions.models import Interaction
from people.models import ContactMethod, MemoryAid, Note, Person
from tests.factories import (
    ContactMethodFactory,
    InteractionFactory,
    MemoryAidFactory,
    NoteFactory,
    PersonFactory,
    TagFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("day", "month", "year"),
    [
        (None, None, None),
        (3, 4, None),
        (3, 4, 1994),
        (29, 2, None),  # no year: 29 February is fine
        (29, 2, 2024),
    ],
)
def test_valid_birthdays(day, month, year):
    person = PersonFactory(birth_day=day, birth_month=month, birth_year=year)

    person.full_clean()


@pytest.mark.parametrize(
    ("day", "month", "year"),
    [
        (29, 2, 2025),  # not a leap year
        (31, 4, None),  # April has 30 days
    ],
)
def test_birthdays_that_are_not_real_dates_fail_validation(day, month, year):
    person = PersonFactory(birth_day=day, birth_month=month, birth_year=year)

    with pytest.raises(ValidationError):
        person.full_clean()


@pytest.mark.parametrize(
    ("day", "month", "year"),
    [
        (3, None, None),  # day without month
        (None, 4, None),  # month without day
        (None, None, 1994),  # year only
        (3, 13, None),
        (0, 4, None),
        (32, 1, None),
    ],
)
def test_the_database_rejects_incomplete_or_out_of_range_birthdays(day, month, year):
    with pytest.raises(IntegrityError):
        PersonFactory(birth_day=day, birth_month=month, birth_year=year)


def test_tag_names_are_unique_per_owner_ignoring_case():
    ela = UserFactory()
    TagFactory(owner=ela, name="Climbing")

    with pytest.raises(IntegrityError):
        TagFactory(owner=ela, name="climbing")


def test_different_owners_can_use_the_same_tag_name():
    TagFactory(name="climbing")
    TagFactory(name="climbing")


def test_a_person_can_have_several_tags():
    tom = PersonFactory()
    designer = TagFactory(owner=tom.owner, name="designer")
    climbing = TagFactory(owner=tom.owner, name="climbing")

    tom.tags.add(designer, climbing)

    assert set(tom.tags.values_list("name", flat=True)) == {"designer", "climbing"}


def test_one_note_per_author_and_person():
    note = NoteFactory()

    with pytest.raises(IntegrityError):
        NoteFactory(person=note.person, author=note.author)


def test_different_authors_keep_separate_notes_on_the_same_person():
    tom = PersonFactory()
    NoteFactory(person=tom, author=tom.owner)
    NoteFactory(person=tom, author=UserFactory())

    assert tom.notes.count() == 2


def test_pinned_memory_aids_come_first():
    emma = PersonFactory()
    later = MemoryAidFactory(person=emma, text="Galatasaray. Obviously.", position=0)
    pinned = MemoryAidFactory(person=emma, text="Allergic to peanuts", pinned=True, position=5)

    assert list(emma.memory_aids.all()) == [pinned, later]


def test_contact_methods_keep_their_order():
    emma = PersonFactory()
    email = ContactMethodFactory(person=emma, kind="email", value="emma@example.com", position=1)
    phone = ContactMethodFactory(person=emma, position=0)

    assert list(emma.contact_methods.all()) == [phone, email]


def test_deleting_a_person_deletes_everything_about_them():
    emma = PersonFactory()
    NoteFactory(person=emma)
    MemoryAidFactory(person=emma)
    ContactMethodFactory(person=emma)
    InteractionFactory(person=emma)

    emma.delete()

    assert not Person.objects.filter(pk=emma.pk).exists()
    for model in (Note, MemoryAid, ContactMethod, Interaction):
        assert not model.objects.exists()
