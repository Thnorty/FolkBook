import datetime

import pytest

from access.policy import Access
from people.models import Person
from people.search import search_people
from tests.factories import (
    InteractionFactory,
    MemoryAidFactory,
    NoteFactory,
    PersonFactory,
    TagFactory,
)

pytestmark = pytest.mark.django_db


def names(api, **params) -> list[str]:
    return [person["name"] for person in api.get("/people", **params).json()["items"]]


def found(access_user, text: str) -> set[str]:
    access = Access.for_user(access_user)
    return set(search_people(access, Person.objects.all(), text).values_list("name", flat=True))


class TestWhatSearchMatches:
    def test_names_ignoring_case_and_accents(self, world):
        PersonFactory(owner=world.ela, name="Selin Yılmaz")
        PersonFactory(owner=world.ela, name="Şükrü Öztürk")

        assert found(world.ela, "yilmaz") == {"Selin Yılmaz"}
        assert found(world.ela, "YILMAZ") == {"Selin Yılmaz"}
        assert found(world.ela, "sukru ozturk") == {"Şükrü Öztürk"}

    def test_how_you_met_work_and_tags(self, world):
        PersonFactory(owner=world.ela, name="Priya", work="Manager at Loop")
        PersonFactory(owner=world.ela, name="Burak", how_we_met="Stats study group")
        world.emma.tags.add(TagFactory(owner=world.ela, name="Galatasaray"))

        assert found(world.ela, "loop") == {"Priya"}
        assert found(world.ela, "study") == {"Burak"}
        assert found(world.ela, "galatasaray") == {"Emma"}

    def test_spaces_you_can_see(self, world):
        assert found(world.ela, "climbing") == {"Oskar", "Ines"}
        assert found(world.ela, "hackathon") == {"Tom", "Ola"}

    def test_your_own_notes_and_memory_aids(self, world):
        MemoryAidFactory(author=world.ela, person=world.emma, text="Kid: Arda, allergic to peanuts")

        assert found(world.ela, "tuesday routes") == {"Oskar"}
        assert found(world.ela, "peanuts") == {"Emma"}

    def test_every_word_has_to_match(self, world):
        assert found(world.ela, "oskar routes") == {"Oskar"}
        assert found(world.ela, "oskar peanuts") == set()


class TestSearchPrivacy:
    def test_never_matches_someone_elses_note(self, world):
        # Deniz wrote "owes me a belay" about Oskar, whom Ela can see too.
        assert found(world.ela, "belay") == set()
        assert found(world.deniz, "belay") == {"Oskar"}

    def test_never_matches_someone_elses_memory_aid(self, world):
        MemoryAidFactory(author=world.deniz, person=world.oskar, text="Secret birthday plan")

        assert found(world.ela, "secret") == set()

    def test_never_matches_a_space_you_cant_see(self, world):
        # Kaan is in Climbing club but not in Hackathon 2026, which also has no Oskar.
        assert found(world.kaan, "hackathon") == set()

    def test_only_returns_people_you_can_see(self, api, world):
        NoteFactory(
            author=world.sofia, person=PersonFactory(owner=world.sofia, name="Mira"), body="routes"
        )

        assert names(api.login(world.ela), search="routes") == ["Oskar"]
        assert names(api.login(world.sofia), search="routes") == ["Mira"]


class TestListFields:
    def test_needs_details_until_you_write_how_you_met(self, api, world):
        world.emma.how_we_met = "University, Istanbul · 2015"
        world.emma.save()

        people = {p["name"]: p for p in api.login(world.ela).get("/people").json()["items"]}

        assert people["Emma"]["needs_details"] is False
        assert people["Ines"]["needs_details"] is True
        assert people["Ela"]["needs_details"] is False  # your own Me never needs details
        assert names(api, needs_details=True) == sorted(
            name for name, p in people.items() if p["needs_details"]
        )

    def test_last_talked_is_your_own_latest_timeline_entry(self, api, world):
        InteractionFactory(
            author=world.ela, person=world.oskar, occurred_on=datetime.date(2026, 9, 12)
        )
        InteractionFactory(
            author=world.ela, person=world.oskar, occurred_on=datetime.date(2026, 8, 1)
        )
        InteractionFactory(
            author=world.deniz, person=world.oskar, occurred_on=datetime.date(2026, 9, 20)
        )

        def last_talked(user):
            items = api.login(user).get("/people").json()["items"]
            return {p["name"]: p["last_talked_on"] for p in items}

        assert last_talked(world.ela)["Oskar"] == "2026-09-12"  # not Deniz's later entry
        assert last_talked(world.ela)["Emma"] is None
        assert last_talked(world.kaan)["Oskar"] is None  # Ela's and Deniz's timelines are private
