"""Import jobs. The periodic ones are enqueued by jobs.scheduler."""

from django.tasks import task

from imports import undo


@task
def forget_taken_back_photos() -> int:
    """Delete the photos undone imports took back, once Undo has run out."""
    return undo.forget_taken_back_photos()
