import importlib

import pytest
from django.conf import settings
from django.db import connection

pytestmark = pytest.mark.django_db


def test_postgres_never_compiles_queries_just_in_time():
    # On a small book Postgres has few statistics, overestimates a search and spends seconds
    # compiling it (JIT) to run it in milliseconds. The setting lives on the database, so
    # every session has it, also through a connection pooler.
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT setconfig FROM pg_db_role_setting JOIN pg_database d ON d.oid = setdatabase "
            "WHERE d.datname = current_database() AND setrole = 0"
        )
        assert "jit=off" in (cursor.fetchone() or [[]])[0]


def test_connects_without_startup_options():
    # Connection poolers such as PgBouncer refuse settings sent when connecting.
    assert "options" not in settings.DATABASES["default"].get("OPTIONS", {})


def test_a_user_who_does_not_own_the_database_gets_a_notice_not_a_failure():
    turn_off = importlib.import_module("people.migrations.0012_turn_off_jit").TURN_OFF
    with connection.cursor() as cursor:
        cursor.execute("CREATE ROLE folkbook_not_the_owner")  # undone with the test
        cursor.execute("SET ROLE folkbook_not_the_owner")
        try:
            cursor.execute(turn_off)
        finally:
            cursor.execute("RESET ROLE")
