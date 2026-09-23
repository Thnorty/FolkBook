from django.contrib import admin

from people.models import Person


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "account", "created_at"]
    list_select_related = ["owner", "account"]
    search_fields = ["name", "owner__email"]
    readonly_fields = ["created_at", "updated_at"]
