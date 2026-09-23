"""People endpoints. Uses the shared `world` (tests/worlds.py) and `api` client."""

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext

from people.models import Person
from tests.factories import PersonFactory, TagFactory, UserFactory

pytestmark = pytest.mark.django_db


def names(response) -> list[str]:
    return [p["name"] for p in response.json()["items"]]


def by_name(response, name: str) -> dict:
    return next(p for p in response.json()["items"] if p["name"] == name)


# ---------------------------------------------------------------- listing


def test_the_api_needs_a_logged_in_user(api):
    assert api.get("/people").status_code == 401


def test_list_shows_everyone_the_user_can_see_in_name_order(api, world):
    response = api.login(world.ela).get("/people")

    assert response.status_code == 200
    assert names(response) == [
        "Defne",
        "Deniz",
        "Ela",
        "Emma",
        "Ines",
        "Kaan",
        "Ola",
        "Oskar",
        "Tom",
    ]
    assert response.json()["count"] == 9


def test_names_sort_the_way_people_expect(api):
    user = UserFactory(name="Zeynep")
    for name in ["Şen", "ayla", "Émile", "Ayşe", "Sofia"]:
        PersonFactory(owner=user, name=name)

    assert names(api.login(user).get("/people")) == [
        "ayla",
        "Ayşe",
        "Émile",
        "Şen",
        "Sofia",
        "Zeynep",
    ]


def test_list_fields_reflect_the_viewer(api, world):
    tom_tag = TagFactory(owner=world.defne, name="designer")
    world.tom.tags.add(tom_tag)

    response = api.login(world.ela).get("/people")

    ela, tom, oskar = (by_name(response, n) for n in ("Ela", "Tom", "Oskar"))
    assert ela["is_me"] and ela["is_mine"]
    assert not tom["is_me"] and not tom["is_mine"]
    assert tom["owner"]["name"] == "Defne"  # "Shared by Defne"
    assert tom["tags"] == ["designer"]
    assert [s["name"] for s in tom["spaces"]] == ["Hackathon 2026"]
    assert [s["name"] for s in oskar["spaces"]] == ["Climbing club"]


def test_list_filtered_by_space(api, world):
    response = api.login(world.ela).get("/people", space=str(world.climbing.pk))

    assert names(response) == ["Ines", "Oskar"]


def test_filtering_by_a_space_you_cannot_see_shows_nobody(api, world):
    response = api.login(world.deniz).get("/people", space=str(world.hackathon.pk))

    assert names(response) == []


def test_list_of_people_who_need_details(api, world):
    world.oskar.how_we_met = "Bouldergarten, Tuesday nights"
    world.oskar.save()

    response = api.login(world.ela).get("/people", space=str(world.climbing.pk), needs_details=True)

    assert names(response) == ["Ines"]


@pytest.mark.parametrize("query", ["şen", "ŞEN", "Hakan Ş"])
def test_search_handles_turkish_letters(api, query):
    user = UserFactory()
    PersonFactory(owner=user, name="Hakan Şen")

    assert names(api.login(user).get("/people", search=query)) == ["Hakan Şen"]


def test_listing_takes_the_same_number_of_queries_for_a_bigger_book(api, world):
    client = api.login(world.ela)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            assert client.get("/people").status_code == 200
        return len(captured)

    before = queries()
    for index in range(15):
        person = PersonFactory(owner=world.ela)
        world.climbing.people.add(person)
        person.tags.add(TagFactory(owner=world.ela, name=f"tag{index}"))

    assert queries() == before


# ---------------------------------------------------------------- one person


def test_someone_you_cannot_see_is_not_found(api, world):
    assert api.login(world.ela).get(f"/people/{world.jin.pk}").status_code == 404


@pytest.mark.parametrize(
    ("who", "can_edit", "can_delete"),
    [("ela", True, True), ("deniz", True, False), ("kaan", False, False)],
)
def test_detail_says_what_the_viewer_may_do(api, world, who, can_edit, can_delete):
    person = api.login(getattr(world, who)).get(f"/people/{world.oskar.pk}").json()

    assert (person["can_edit"], person["can_delete"]) == (can_edit, can_delete)


@pytest.mark.parametrize(("who", "sees_phone"), [("ela", True), ("kaan", False), ("deniz", False)])
def test_contact_details_follow_the_space_setting(api, world, who, sees_phone):
    person = api.login(getattr(world, who)).get(f"/people/{world.ines.pk}").json()

    assert bool(person["contact_methods"]) == sees_phone


def test_members_see_contact_details_once_the_space_shares_them(api, world):
    world.climbing.share_contact_details = True
    world.climbing.save()

    person = api.login(world.kaan).get(f"/people/{world.ines.pk}").json()

    assert [c["value"] for c in person["contact_methods"]] == ["+46 70 555 12 90"]


# ---------------------------------------------------------------- creating


def test_create_a_person(api, world):
    response = api.login(world.ela).post(
        "/people",
        {
            "name": "Tahir Kaya",
            "how_we_met": "Hackathon afterparty",
            "birthday": {"day": 29, "month": 2},
            "tags": ["Designer", "designer", " climbing "],
            "contact_methods": [{"kind": "email", "value": "tahir@example.com"}],
            "space_ids": [str(world.climbing.pk)],
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["is_mine"] and body["can_delete"]
    assert body["birthday"] == {"day": 29, "month": 2, "year": None}
    assert body["tags"] == ["climbing", "Designer"]
    assert [c["value"] for c in body["contact_methods"]] == ["tahir@example.com"]
    assert [s["name"] for s in body["spaces"]] == ["Climbing club"]


def test_tags_are_reused_ignoring_case(api, world):
    TagFactory(owner=world.ela, name="Climbing")

    body = api.login(world.ela).post("/people", {"name": "Ada", "tags": ["climbing"]}).json()

    assert body["tags"] == ["Climbing"]


@pytest.mark.parametrize(
    "payload",
    [
        {"name": ""},
        {"name": "Ada", "birthday": {"day": 31, "month": 4}},  # 31 April
        {"name": "Ada", "birthday": {"day": 29, "month": 2, "year": 2025}},  # not a leap year
        {"name": "Ada", "birthday": {"day": 1, "month": 13}},
        {"name": "Ada", "contact_methods": [{"kind": "pigeon", "value": "x"}]},
    ],
)
def test_invalid_people_are_rejected(api, world, payload):
    response = api.login(world.ela).post("/people", payload)

    assert response.status_code == 422
    assert response.json()["detail"]


def test_adding_someone_to_a_space_you_only_view_changes_nothing(api, world):
    before = Person.objects.count()

    response = api.login(world.ela).post(
        "/people", {"name": "Ada", "space_ids": [str(world.hackathon.pk)]}
    )

    assert response.status_code == 403
    assert Person.objects.count() == before


def test_adding_someone_to_an_unknown_space_is_rejected(api, world):
    response = api.login(world.deniz).post(
        "/people", {"name": "Ada", "space_ids": [str(world.hackathon.pk)]}
    )

    assert response.status_code == 422


# ---------------------------------------------------------------- changing


def test_editors_can_fix_basic_details(api, world):
    response = api.login(world.deniz).patch(f"/people/{world.oskar.pk}", {"work": "Route setter"})

    assert response.status_code == 200
    assert response.json()["work"] == "Route setter"


def test_only_the_owner_changes_tags_and_contact_details(api, world):
    response = api.login(world.deniz).patch(f"/people/{world.oskar.pk}", {"tags": ["x"]})

    assert response.status_code == 403
    assert "owner" in response.json()["detail"]


@pytest.mark.parametrize(("who", "status"), [("kaan", 403), ("sofia", 404)])
def test_viewers_and_strangers_cannot_edit(api, world, who, status):
    response = api.login(getattr(world, who)).patch(f"/people/{world.oskar.pk}", {"name": "X"})

    assert response.status_code == status
    world.oskar.refresh_from_db()
    assert world.oskar.name == "Oskar"


def test_patch_changes_only_what_is_sent_and_can_clear_a_birthday(api, world):
    world.oskar.birth_day, world.oskar.birth_month = 3, 4
    world.oskar.work = "Physio"
    world.oskar.save()

    body = api.login(world.ela).patch(f"/people/{world.oskar.pk}", {"birthday": None}).json()

    assert body["birthday"] is None
    assert body["work"] == "Physio"


def test_replacing_contact_details(api, world):
    body = (
        api.login(world.ela)
        .patch(
            f"/people/{world.ines.pk}",
            {"contact_methods": [{"kind": "email", "value": "ines@example.com"}]},
        )
        .json()
    )

    assert [c["value"] for c in body["contact_methods"]] == ["ines@example.com"]


# ---------------------------------------------------------------- deleting


@pytest.mark.parametrize(
    ("who", "target", "status"),
    [
        ("ela", "oskar", 204),
        ("deniz", "oskar", 403),
        ("sofia", "oskar", 404),
    ],
)
def test_delete_a_person(api, world, who, target, status):
    person = getattr(world, target)

    response = api.login(getattr(world, who)).delete(f"/people/{person.pk}")

    assert response.status_code == status
    assert Person.objects.filter(pk=person.pk).exists() == (status != 204)


def test_your_me_cannot_be_deleted(api, world):
    assert api.login(world.ela).delete(f"/people/{world.ela.me.pk}").status_code == 403
