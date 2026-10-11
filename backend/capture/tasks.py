"""Quick capture jobs. The periodic one is enqueued by jobs.scheduler."""

from django.tasks import task

from capture import save


@task
def forget_old_captures() -> int:
    """Delete the records "Undo all of this" needs, a day after saving."""
    return save.forget_old_captures()
