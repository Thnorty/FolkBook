from django.contrib import admin

from jobs.models import ScheduledRun


@admin.register(ScheduledRun)
class ScheduledRunAdmin(admin.ModelAdmin):
    list_display = ["name", "last_enqueued_at"]
    readonly_fields = ["name", "last_enqueued_at"]
