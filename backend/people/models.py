import datetime

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower

from core.models import BaseModel

# Used to validate day + month when the year is unknown (29 February must be allowed).
LEAP_YEAR = 2000


class Tag(BaseModel):
    """A label like "designer" or "climbing". Tags belong to the user who owns the people."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tags"
    )
    name = models.CharField(max_length=50)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                "owner", Lower("name"), name="people_tag_name_unique_per_owner"
            ),
        ]

    def __str__(self) -> str:
        return self.name


def photo_path(person: "Person", filename: str) -> str:
    return f"photos/{person.pk}/{filename}"


class Person(BaseModel):
    """Someone in a user's book. Owned by exactly one user.

    When `account` is set, this person is that user's "Me": the center of
    their graph, and how they appear to others in shared spaces.

    Everything on this model is the *basic profile*, which shared spaces can
    show to other users. Private per-user data (notes, memory aids,
    interactions) lives in separate models keyed by author.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="people"
    )
    account = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="me",
    )
    name = models.CharField(max_length=200)
    how_we_met = models.CharField(max_length=300, blank=True)
    work = models.CharField(max_length=200, blank=True)
    # Birthday parts are separate because the year is often unknown.
    birth_day = models.PositiveSmallIntegerField(null=True, blank=True)
    birth_month = models.PositiveSmallIntegerField(null=True, blank=True)
    birth_year = models.PositiveSmallIntegerField(null=True, blank=True)
    tags = models.ManyToManyField(Tag, blank=True, related_name="people")
    # The polaroid: a 4:5 photo and a small copy for lists, re-encoded on upload
    # (people/photos.py), plus the name written under it.
    photo = models.FileField(upload_to=photo_path, blank=True)
    photo_thumbnail = models.FileField(upload_to=photo_path, blank=True)
    photo_caption = models.CharField(max_length=40, blank=True)

    class Meta:
        verbose_name_plural = "people"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(account__isnull=True) | models.Q(account=models.F("owner")),
                name="people_person_me_owned_by_its_account",
            ),
            models.CheckConstraint(
                condition=models.Q(
                    birth_day__isnull=True, birth_month__isnull=True, birth_year__isnull=True
                )
                | models.Q(
                    # Explicit: in SQL a comparison with NULL doesn't fail a CHECK.
                    birth_day__isnull=False,
                    birth_month__isnull=False,
                    birth_day__gte=1,
                    birth_day__lte=31,
                    birth_month__gte=1,
                    birth_month__lte=12,
                ),
                name="people_person_birthday_has_day_and_month",
            ),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def is_me(self) -> bool:
        return self.account_id is not None

    def clean(self) -> None:
        if self.birth_day is None and self.birth_month is None and self.birth_year is None:
            return
        if self.birth_day is None or self.birth_month is None:
            raise ValidationError("A birthday needs both a day and a month.")
        try:
            datetime.date(self.birth_year or LEAP_YEAR, self.birth_month, self.birth_day)
        except ValueError as error:
            raise ValidationError("That birthday isn't a real date.") from error


class ContactMethod(BaseModel):
    """A phone number, email address or social handle. Shared only if a space allows it."""

    class ContactKind(models.TextChoices):
        PHONE = "phone"
        EMAIL = "email"
        SOCIAL = "social"
        OTHER = "other"

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="contact_methods")
    kind = models.CharField(max_length=10, choices=ContactKind.choices)
    label = models.CharField(max_length=50, blank=True)
    value = models.CharField(max_length=255)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return f"{self.get_kind_display()}: {self.value}"


class Note(BaseModel):
    """A user's free-form notes about a person. Private to the author, one per person."""

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="notes")
    body = models.TextField()

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["author", "person"], name="people_note_one_per_author"),
        ]

    def __str__(self) -> str:
        return f"Note on {self.person}"


class MemoryAid(BaseModel):
    """A small "remember this" fact (a sticky note). Private to the author."""

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="memory_aids")
    text = models.CharField(max_length=300)
    pinned = models.BooleanField(default=False)
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["-pinned", "position", "created_at"]

    def __str__(self) -> str:
        return self.text
