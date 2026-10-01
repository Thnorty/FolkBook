"""The palette's search: grouped, and only over what the user can see."""

import pytest

from search.search import fold, snippet
from tests.factories import MemoryAidFactory, NoteFactory, PersonFactory

pytestmark = pytest.mark.django_db


def search(api, user, q: str) -> dict:
    response = api.login(user).get("/search", q=q)
    assert response.status_code == 200, response.content
    return response.json()


def names(hits: list[dict]) -> list[str]:
    return [hit["name"] for hit in hits]


def test_people_and_spaces_match_without_accents(api, world):
    PersonFactory(owner=world.ela, name="Emma Yılmaz")

    assert names(search(api, world.ela, "yilmaz")["people"]) == ["Emma Yılmaz"]
    assert names(search(api, world.ela, "climb")["spaces"]) == ["Climbing club"]


def test_your_memory_aids_and_notes_match_with_a_snippet(api, world):
    MemoryAidFactory(person=world.oskar, author=world.ela, text="Climbs at Bouldergarten")

    found = search(api, world.ela, "tuesday")
    aids = search(api, world.ela, "boulder")["memory_aids"]

    assert found["notes"] == [
        {
            "person": {"id": str(world.oskar.pk), "name": "Oskar"},
            "snippet": found["notes"][0]["snippet"],
        }
    ]
    assert "Tuesday routes" in found["notes"][0]["snippet"]
    assert [(aid["text"], aid["person"]["name"]) for aid in aids] == [
        ("Climbs at Bouldergarten", "Oskar")
    ]


def test_other_peoples_notes_and_memory_aids_never_match(api, world):
    MemoryAidFactory(person=world.oskar, author=world.deniz, text="Owes Deniz a rope")

    found = search(api, world.ela, "belay")  # only in Deniz's note
    rope = search(api, world.ela, "rope")

    assert found["notes"] == [] and found["people"] == []
    assert rope["memory_aids"] == []


@pytest.mark.parametrize(
    ("who", "q"),
    [
        ("sofia", "oskar"),  # can't see Oskar
        ("deniz", "hackathon"),  # can't see Defne's space
        ("ela", "jin"),  # Defne's, not shared with Ela
    ],
)
def test_nothing_you_cannot_see(api, world, who, q):
    found = search(api, getattr(world, who), q)

    assert found["people"] == found["spaces"] == []
    assert found["did_you_mean"] is None or found["did_you_mean"]["name"] != "Jin"


def test_did_you_mean_suggests_the_closest_name_when_no_one_matches(api, world):
    assert search(api, world.ela, "oskr")["did_you_mean"]["name"] == "Oskar"
    assert search(api, world.ela, "zzzz")["did_you_mean"] is None
    assert search(api, world.ela, "oskar")["did_you_mean"] is None  # found: no suggestion


def test_an_empty_search_is_refused(api, world):
    assert api.login(world.ela).get("/search", q="").status_code == 422


def test_snippet_shows_the_words_around_the_match():
    body = "We talked for hours. First time climbing outdoors, Frankenjura in May. Loved it."

    assert (
        snippet(body, "climbing")
        == "…for hours. First time climbing outdoors, Frankenjura in May.…"
    )
    assert snippet("Short note", "note") == "Short note"


def test_fold_ignores_case_and_accents():
    assert fold("Yılmaz") == fold("YILMAZ") == "yilmaz"
    assert fold("Şükrü Öztürk") == "sukru ozturk"


def test_notes_about_people_you_cannot_see_stay_hidden(api, world):
    NoteFactory(author=world.ela, person=world.jin, body="Ela wrote about Jin, then lost access")

    assert search(api, world.ela, "lost access")["notes"] == []
