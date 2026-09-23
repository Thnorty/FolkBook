import uuid

from django.conf import settings
from django.db import models


class Person(models.Model):
    """Someone in a user's book. Owned by exactly one user.

    When `account` is set, this person is that user's "Me": the center of
    their graph, and how they appear to others in shared spaces.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "people"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(account__isnull=True) | models.Q(account=models.F("owner")),
                name="people_person_me_owned_by_its_account",
            ),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def is_me(self) -> bool:
        return self.account_id is not None
