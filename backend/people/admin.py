from django.contrib import admin

from people.models import ContactMethod, MemoryAid, Note, Person, Tag


class ContactMethodInline(admin.TabularInline):
    model = ContactMethod
    extra = 0


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ["name", "owner", "account", "created_at"]
    list_select_related = ["owner", "account"]
    search_fields = ["name", "owner__email"]
    readonly_fields = ["created_at", "updated_at"]
    autocomplete_fields = ["tags"]
    inlines = [ContactMethodInline]


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ["name", "owner"]
    list_select_related = ["owner"]
    search_fields = ["name"]


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ["person", "author", "updated_at"]
    list_select_related = ["person", "author"]
    raw_id_fields = ["person"]


@admin.register(MemoryAid)
class MemoryAidAdmin(admin.ModelAdmin):
    list_display = ["text", "person", "author", "pinned"]
    list_select_related = ["person", "author"]
    raw_id_fields = ["person"]
