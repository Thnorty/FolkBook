"""Turn off Postgres's just-in-time compiling for FolkBook's database.

It pays off for long reports, not for an app's short queries: on a small book Postgres has
few statistics, overestimates a search and spent seconds compiling it to run it in
milliseconds. Set on the database (not when connecting), so every session has it, also
through a connection pooler such as PgBouncer, which refuses settings sent at connect time.
Only the database's owner may change it; anyone else gets a notice, not a failed deploy.
"""

from django.db import migrations

TURN_OFF = """
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET jit = off', current_database());
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'FolkBook could not turn off JIT (only the database owner can): searches '
        'may be slow. As the owner, run: ALTER DATABASE % SET jit = off', current_database();
END $$;
"""

PUT_BACK = """
DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I RESET jit', current_database());
EXCEPTION WHEN insufficient_privilege THEN
    NULL;
END $$;
"""


class Migration(migrations.Migration):
    dependencies = [("people", "0011_contactmethod_added_by_import")]

    operations = [migrations.RunSQL(TURN_OFF, PUT_BACK)]
