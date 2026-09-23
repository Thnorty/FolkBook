from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm

from accounts.models import User


class UserCreationForm(AdminUserCreationForm):
    name = forms.CharField(
        max_length=200, required=False, help_text="Name on their Me profile. Optional."
    )

    class Meta:
        model = User
        fields = ["email"]

    def save(self, commit: bool = True) -> User:
        # Always go through the manager so the user also gets their "Me" person.
        # The admin calls save(commit=False) and then save_m2m(); both are supported.
        usable = self.cleaned_data.get("set_usable_password", True)
        self.instance = User.objects.create_user(
            email=self.cleaned_data["email"],
            password=self.cleaned_data["password1"] if usable else None,
            name=self.cleaned_data["name"],
        )
        self.save_m2m = self._save_m2m
        return self.instance


class UserEditForm(UserChangeForm):
    class Meta:
        model = User
        fields = ["email", "is_active", "is_staff", "is_superuser"]


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = UserEditForm
    add_form = UserCreationForm
    list_display = ["email", "is_staff", "is_active", "date_joined", "last_login"]
    list_filter = ["is_staff", "is_active"]
    search_fields = ["email"]
    ordering = ["email"]
    readonly_fields = ["date_joined", "last_login"]
    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Permissions", {"fields": ["is_active", "is_staff", "is_superuser"]}),
        ("Dates", {"fields": ["date_joined", "last_login"]}),
    ]
    add_fieldsets = [
        (None, {"classes": ["wide"], "fields": ["email", "name", "password1", "password2"]}),
    ]
    filter_horizontal = []
