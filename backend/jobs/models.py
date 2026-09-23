from django.db import models


class ScheduledRun(models.Model):
    """When a periodic job was last enqueued, so restarts don't repeat it too soon."""

    name = models.CharField(max_length=100, unique=True)
    last_enqueued_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.name} (last enqueued {self.last_enqueued_at})"
