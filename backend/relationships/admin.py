from django.contrib import admin

from relationships.models import Relationship


@admin.register(Relationship)
class RelationshipAdmin(admin.ModelAdmin):
    list_display = ["person_a", "type", "person_b", "space", "owner", "is_former"]
    list_select_related = ["person_a", "person_b", "space", "owner"]
    list_filter = ["type", "is_former"]
    raw_id_fields = ["person_a", "person_b", "space"]
