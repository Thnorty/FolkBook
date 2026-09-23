from django.contrib import admin

from spaces.models import Space, SpaceMembership, SpacePerson


class SpacePersonInline(admin.TabularInline):
    model = SpacePerson
    extra = 0
    raw_id_fields = ["person", "added_by"]


class SpaceMembershipInline(admin.TabularInline):
    model = SpaceMembership
    extra = 0
    raw_id_fields = ["user"]


@admin.register(Space)
class SpaceAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "color", "share_contact_details", "created_at"]
    list_select_related = ["owner"]
    search_fields = ["name", "owner__email"]
    inlines = [SpaceMembershipInline, SpacePersonInline]
