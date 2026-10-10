"""Prepare the database the end-to-end tests run on: empty, with two known accounts.

It wipes everything, so it only ever runs on a database whose name ends in `_e2e`.
"""

import os

import psycopg
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from psycopg import sql

from accounts.models import User

KNOWN_ACCOUNTS = [
    ("ela@e2e.test", "Ela Yılmaz", True),
    ("deniz@e2e.test", "Deniz Kaya", False),
]


def create_known_accounts(password: str) -> list[User]:
    """The accounts the tests log in with, each with their Me."""
    return [
        (User.objects.create_superuser if admin else User.objects.create_user)(
            email, password, name=name
        )
        for email, name, admin in KNOWN_ACCOUNTS
    ]


def _create_database_if_missing(settings: dict) -> None:
    with psycopg.connect(
        dbname="postgres",
        user=settings["USER"],
        password=settings["PASSWORD"],
        host=settings["HOST"],
        port=settings["PORT"],
        autocommit=True,
    ) as admin:
        name = settings["NAME"]
        if not admin.execute("SELECT 1 FROM pg_database WHERE datname = %s", [name]).fetchone():
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))


class Command(BaseCommand):
    help = "Empty the end-to-end test database and create its known accounts."

    def handle(self, *args, **options):
        name = connection.settings_dict["NAME"]
        if not name.endswith("_e2e"):
            raise CommandError(
                f"Refusing to reset {name}: e2e_reset only runs on a database whose name "
                "ends in _e2e."
            )
        _create_database_if_missing(connection.settings_dict)
        call_command("migrate", verbosity=0)
        call_command("flush", interactive=False, verbosity=0)
        create_known_accounts(os.environ.get("E2E_PASSWORD", "e2e-pass-123"))
        self.stdout.write(f"Reset {name}.")
