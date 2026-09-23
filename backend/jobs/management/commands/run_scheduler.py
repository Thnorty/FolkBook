import time

from django.core.management.base import BaseCommand

from jobs.scheduler import enqueue_due

TICK_SECONDS = 30


class Command(BaseCommand):
    help = "Enqueue periodic background jobs when they're due. Runs until stopped."

    def handle(self, *args, **options):
        self.stdout.write("Scheduler started.")
        while True:
            for name in enqueue_due():
                self.stdout.write(f"Enqueued {name}")
            time.sleep(TICK_SECONDS)
