"""What Fill in the blanks reads: an import's people, and where someone came from."""

from django.db import connection
from django.test.utils import CaptureQueriesContext

from access.policy import Access, visible_imports
from imports.models import Import
from tests.factories import PersonFactory


def imported(user, *people, file_name="contacts.vcf") -> Import:
    batch = Import.objects.create(owner=user, file_name=file_name)
    for person in people:
        person.added_by_import = batch
        person.save()
    return batch


def names(response) -> list[str]:
    return [person["name"] for person in response.json()["items"]]


def test_the_import_filter_lists_that_imports_people(api, world):
    first = imported(world.ela, world.emma, world.oskar)
    imported(world.ela, world.ines, file_name="work.vcf")

    response = api.login(world.ela).get("/people", **{"import": str(first.pk)})

    assert sorted(names(response)) == ["Emma", "Oskar"]


def test_it_combines_with_needs_details(api, world):
    batch = imported(world.ela, world.emma, world.oskar)
    world.oskar.how_we_met = "Climbing gym"
    world.oskar.save()

    response = api.login(world.ela).get("/people", needs_details=True, **{"import": str(batch.pk)})

    assert names(response) == ["Emma"]


def test_another_users_import_lists_nobody(api, world):
    batch = imported(world.ela, world.oskar)  # Deniz sees Oskar through Climbing club

    response = api.login(world.deniz).get("/people", **{"import": str(batch.pk)})

    assert response.json() == {"items": [], "count": 0}


def test_from_import_is_only_for_the_owner(api, world):
    batch = imported(world.ela, world.oskar)

    mine = api.login(world.ela).get(f"/people/{world.oskar.pk}").json()
    theirs = api.login(world.deniz).get(f"/people/{world.oskar.pk}").json()

    assert mine["from_import"] == {"id": str(batch.pk), "file_name": "contacts.vcf"}
    assert theirs["from_import"] is None


def test_space_limited_access_sees_no_imports(world):
    imported(world.ela, world.emma)
    access = Access.limited(world.ela, space_ids=[world.climbing.pk], include_private=True)

    assert not visible_imports(access).exists()
    assert visible_imports(Access.for_user(world.ela)).count() == 1


def test_query_count_does_not_grow_with_the_import(api, world):
    batch = imported(world.ela, world.emma)
    client = api.login(world.ela)

    def queries() -> int:
        with CaptureQueriesContext(connection) as captured:
            client.get("/people", needs_details=True, **{"import": str(batch.pk)})
        return len(captured)

    before = queries()
    imported_people = [PersonFactory(owner=world.ela) for _ in range(5)]
    for person in imported_people:
        person.added_by_import = batch
        person.save()

    assert queries() == before


def test_mine_lists_only_your_own_people(api, world):
    # Deniz sees Ela's Oskar and Ines through Climbing club, and has his own Yuki.
    response = api.login(world.deniz).get("/people", needs_details=True, mine=True)

    assert names(response) == ["Yuki"]
