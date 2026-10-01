"""Taking a shared person out of your book: hidden for you only, and undoable."""

import pytest

pytestmark = pytest.mark.django_db


def names(response) -> set[str]:
    return {person["name"] for person in response.json()["items"]}


@pytest.fixture
def deniz_hid_oskar(api, world):
    """Oskar is Ela's, in Climbing club; Deniz (an editor there) takes him out."""
    assert api.login(world.deniz).post(f"/people/{world.oskar.pk}/hide").status_code == 204
    return api.login(world.deniz)


def test_they_are_gone_from_your_book(world, deniz_hid_oskar):
    client = deniz_hid_oskar

    assert "Oskar" not in names(client.get("/people"))
    assert "Oskar" not in names(client.get("/people", search="osk"))
    assert client.get(f"/people/{world.oskar.pk}").status_code == 404
    assert client.get(f"/people/{world.oskar.pk}/note").status_code == 404


@pytest.mark.parametrize("who", ["ela", "kaan"])  # the owner, another member
def test_nobody_else_is_affected(api, world, deniz_hid_oskar, who):
    assert "Oskar" in names(api.login(getattr(world, who)).get("/people"))


def test_the_space_lists_them_to_add_back(world, deniz_hid_oskar):
    response = deniz_hid_oskar.get(f"/spaces/{world.climbing.pk}/hidden-people")

    assert [person["name"] for person in response.json()["items"]] == ["Oskar"]


def test_others_see_nothing_hidden_in_the_space(api, world, deniz_hid_oskar):
    response = api.login(world.ela).get(f"/spaces/{world.climbing.pk}/hidden-people")

    assert response.json()["items"] == []


def test_adding_them_back_brings_your_notes_back(world, deniz_hid_oskar):
    client = deniz_hid_oskar

    response = client.post(f"/people/{world.oskar.pk}/unhide")

    assert response.status_code == 200
    assert response.json()["name"] == "Oskar"
    assert client.get(f"/people/{world.oskar.pk}/note").json()["body"].startswith("Deniz:")


@pytest.mark.parametrize(
    ("who", "target", "status"),
    [
        ("ela", "oskar", 403),  # your own: delete them instead
        ("ela", "ela_me", 403),  # your own Me
        ("deniz", "ela_me", 204),  # someone else's Me, in a shared space
        ("sofia", "oskar", 404),  # can't see him
    ],
)
def test_who_can_be_taken_out(api, world, who, target, status):
    person = world.ela.me if target == "ela_me" else getattr(world, target)

    response = api.login(getattr(world, who)).post(f"/people/{person.pk}/hide")

    assert response.status_code == status


def test_the_profile_says_whether_you_can_take_them_out(api, world):
    shared = api.login(world.deniz).get(f"/people/{world.oskar.pk}").json()
    own = api.login(world.ela).get(f"/people/{world.oskar.pk}").json()

    assert (shared["can_hide"], own["can_hide"]) == (True, False)


def test_adding_back_someone_not_hidden_is_not_found(api, world):
    assert api.login(world.deniz).post(f"/people/{world.oskar.pk}/unhide").status_code == 404
