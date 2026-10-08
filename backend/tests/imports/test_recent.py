"""Recent imports: the user's own, newest first."""

import datetime

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from imports.models import Import
from people.models import Person
from tests.imports.test_import import CHEN, GRETA, INES, LARS, merge, new, run, vcf


def test_your_imports_newest_first(api, world):
    older = run(api, world.ela, vcf(GRETA, LARS), new(0, 1)).json()["import_id"]
    newer = run(api, world.ela, vcf(CHEN, INES), new(0) + merge(1, world.ines)).json()["import_id"]
    yesterday = timezone.now() - datetime.timedelta(days=1)
    Import.objects.filter(pk=older).update(created_at=yesterday)

    body = api.login(world.ela).get("/imports").json()

    assert body["count"] == 2
    assert [(i["id"], i["added"], i["merged"]) for i in body["items"]] == [
        (newer, 1, 1),
        (older, 2, 0),
    ]
    assert body["items"][0]["file_name"] == "contacts.vcf"
    assert body["items"][0]["undone_at"] is None


def test_added_counts_people_deleted_since(api, world):
    run(api, world.ela, vcf(GRETA, LARS), new(0, 1))
    Person.objects.filter(name="Lars Eriksen").update(deleted_at=timezone.now())

    [item] = api.login(world.ela).get("/imports").json()["items"]

    assert item["added"] == 2


def test_someone_elses_import_is_not_found(api, world):
    run(api, world.ela, vcf(GRETA), new(0))
    batch = Import.objects.get()
    client = api.login(world.deniz)

    assert client.get("/imports").json() == {"items": [], "count": 0}
    assert client.get(f"/imports/{batch.pk}").status_code == 404
    assert api.login(world.ela).get(f"/imports/{batch.pk}").json()["added"] == 1


def test_finished_at_is_set(api, world):
    before = timezone.now()

    run(api, world.ela, vcf(GRETA), new(0))

    assert Import.objects.get().finished_at >= before


def test_query_count_does_not_grow(api, world):
    client = api.login(world.ela)

    def queries() -> int:
        with CaptureQueriesContext(connection) as captured:
            client.get("/imports")
        return len(captured)

    run(api, world.ela, vcf(GRETA), new(0))
    before = queries()
    for _ in range(4):
        run(api, world.ela, vcf(LARS, INES), new(0) + merge(1, world.ines))

    assert queries() == before
