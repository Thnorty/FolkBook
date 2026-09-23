from django.conf import settings
from django.db import models
from django.db.models.functions import Lower

from core.models import BaseModel
from people.models import Person


class Space(BaseModel):
    """A group of people ("Family", "Hackathon 2026"). Private until shared.

    Two separate things hang off a space: the *people* in it (`people`) and the
    *users* who can see it (`memberships`, plus the owner).
    """

    class Color(models.TextChoices):
        SAGE = "sage"
        OCHRE = "ochre"
        CLAY = "clay"
        PLUM = "plum"
        TEAL = "teal"
        SLATE = "slate"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_spaces"
    )
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=10, choices=Color.choices, default=Color.SAGE)
    description = models.CharField(max_length=300, blank=True)
    share_contact_details = models.BooleanField(
        default=False, help_text="Let members see phone numbers and email addresses."
    )
    people = models.ManyToManyField(Person, through="SpacePerson", related_name="spaces")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                "owner", Lower("name"), name="spaces_space_name_unique_per_owner"
            ),
        ]

    def __str__(self) -> str:
        return self.name


class SpacePerson(models.Model):
    """A person being in a space."""

    space = models.ForeignKey(Space, on_delete=models.CASCADE)
    person = models.ForeignKey(Person, on_delete=models.CASCADE)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+"
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["space", "person"], name="spaces_person_once_per_space"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.person} in {self.space}"


class SpaceMembership(BaseModel):
    """A user (other than the owner) who can see a shared space."""

    class Role(models.TextChoices):
        EDITOR = "editor"
        VIEWER = "viewer"

    space = models.ForeignKey(Space, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="space_memberships"
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.VIEWER)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["space", "user"], name="spaces_member_once_per_space"),
        ]

    def __str__(self) -> str:
        return f"{self.user} in {self.space} ({self.role})"
