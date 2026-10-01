from django.contrib import admin

from reminders.models import KeepInTouch, ReminderSettings


@admin.register(KeepInTouch)
class KeepInTouchAdmin(admin.ModelAdmin):
    list_display = ["person", "user", "interval_days", "snoozed_until", "stopped"]
    list_select_related = ["person", "user"]
    raw_id_fields = ["person"]


@admin.register(ReminderSettings)
class ReminderSettingsAdmin(admin.ModelAdmin):
    list_display = ["user", "nudges_on", "default_interval_days"]
    list_select_related = ["user"]
