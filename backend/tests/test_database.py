import pytest
from django.db import connection

pytestmark = pytest.mark.django_db


def test_postgres_never_compiles_queries_just_in_time():
    # On a small book Postgres has few statistics, overestimates a search and spends seconds
    # compiling it (JIT) to run it in milliseconds.
    with connection.cursor() as cursor:
        cursor.execute("SHOW jit")
        assert cursor.fetchone()[0] == "off"
