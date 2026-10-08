from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from access.policy import Access
from imports.matching import find_matches, fold, phone_key
from imports.vcard import Card, Detail
from tests.factories import ContactMethodFactory, PersonFactory


def contact(name: str, phones=(), emails=()) -> Card:
    return Card(
        name=name,
        phones=[Detail(value, "") for value in phones],
        emails=[Detail(value, "") for value in emails],
        birthday=None,
        work="",
        photo=None,
        note="",
    )


def match_for(user, card: Card):
    [match] = find_matches(Access.for_user(user), [card])
    return match


def rename(person, name: str):
    person.name = name
    person.save()


def test_fold_and_phone_key():
    assert fold("Ayşe YILMAZ") == fold("ayse yilmaz") == "ayse yilmaz"
    assert phone_key("+46 70-555 12 90") == phone_key("070 555 12 90") == "705551290"
    assert phone_key("112") is None


def test_same_phone(world):
    match = match_for(world.ela, contact("Ines B", phones=["0705551290"]))

    assert match.person == world.ines
    assert (match.reason, match.sure, match.by_details) == ("phone", True, True)


def test_same_email(world):
    ContactMethodFactory(person=world.emma, kind="email", value="emma@example.com")

    match = match_for(world.ela, contact("Someone", emails=["Emma@Example.com"]))

    assert (match.person, match.reason, match.by_details) == (world.emma, "email", True)


def test_same_name_ignoring_case_and_accents(world):
    rename(world.emma, "Ayşe Yılmaz")

    match = match_for(world.ela, contact("ayse yilmaz"))

    assert (match.person, match.reason, match.sure, match.by_details) == (
        world.emma,
        "name",
        True,
        False,
    )


def test_first_name_and_initial(world):
    rename(world.oskar, "Anna Kowalska")

    match = match_for(world.ela, contact("Anna K."))

    assert (match.person, match.reason, match.sure) == (world.oskar, "initial", False)


def test_phone_beats_name(world):
    rename(world.emma, "Ines")

    match = match_for(world.ela, contact("Ines", phones=["+46 70 555 12 90"]))

    assert (match.person, match.reason) == (world.ines, "phone")


def test_short_numbers_dont_match(world):
    ContactMethodFactory(person=world.emma, value="112")

    assert match_for(world.ela, contact("Emergency", phones=["112"])) is None


def test_your_own_people_can_be_merged_into(world):
    assert match_for(world.ela, contact("Emma")).can_merge is True


def test_shared_person_cant_be_merged(world):
    match = match_for(world.ela, contact("Tom"))  # Defne's, seen through Hackathon

    assert (match.person, match.can_merge) == (world.tom, False)


def test_people_you_cant_see_never_match(world):
    assert match_for(world.sofia, contact("Tom")) is None


def test_torn_out_people_dont_match(world):
    world.emma.deleted_at = timezone.now()
    world.emma.save()

    assert match_for(world.ela, contact("Emma")) is None


def test_query_count_does_not_grow_with_the_file(world):
    def queries(count: int) -> int:
        cards = [contact(f"Person {n}", phones=[f"+46 70 555 {n:04}"]) for n in range(count)]
        with CaptureQueriesContext(connection) as captured:
            find_matches(Access.for_user(world.ela), cards)
        return len(captured)

    for n in range(5):
        ContactMethodFactory(person=PersonFactory(owner=world.ela), value=f"+46 70 555 {n:04}")

    assert queries(1) == queries(50)


def test_read_only_access_cant_merge(world):
    access = Access.limited(world.ela, include_private=True, read_only=True)

    [match] = find_matches(access, [contact("Emma")])

    assert match.can_merge is False
