from django.apps import AppConfig
from django.db.models.signals import post_delete


class ImportsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "imports"

    def ready(self) -> None:
        from imports.models import Merge
        from imports.undo import forget_photo_of

        # A signal rather than a call from people.services: merge records also go when
        # their import's owner deletes the account, and the cascade is the one place that
        # sees every way.
        post_delete.connect(
            lambda instance, **_: forget_photo_of(instance), sender=Merge, weak=False
        )
