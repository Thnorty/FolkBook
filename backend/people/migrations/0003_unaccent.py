from django.contrib.postgres.operations import UnaccentExtension
from django.db import migrations


class Migration(migrations.Migration):
    """Search ignores accents (Yılmaz = yilmaz, Şen = sen) with Postgres's unaccent."""

    dependencies = [("people", "0002_person_birth_day_person_birth_month_and_more")]

    operations = [UnaccentExtension()]
