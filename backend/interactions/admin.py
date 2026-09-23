from django.contrib import admin

from interactions.models import Interaction


@admin.register(Interaction)
class InteractionAdmin(admin.ModelAdmin):
    list_display = ["person", "kind", "label", "occurred_on", "author"]
    list_select_related = ["person", "author"]
    list_filter = ["kind"]
    raw_id_fields = ["person"]
