"""People jobs. The periodic ones are enqueued by jobs.scheduler."""

from django.tasks import task

from people import services


@task
def purge_deleted_people() -> int:
    """Make deletes final once Undo has run out. Returns how many people were deleted."""
    return services.purge_deleted_people()
