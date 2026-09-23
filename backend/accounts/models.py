import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models, transaction
from django.db.models.functions import Lower
from django.utils import timezone


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    def normalize_email(self, email: str | None) -> str:
        return super().normalize_email(email).lower()

    def get_by_natural_key(self, username: str) -> "User":
        return self.get(email__iexact=username)

    def create_user(
        self, email: str, password: str | None = None, name: str | None = None, **extra_fields
    ) -> "User":
        """Create a user together with their "Me" person, the center of their graph."""
        from people.services import create_me_person

        if not email:
            raise ValueError("Users must have an email address.")
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        email = self.normalize_email(email)

        with transaction.atomic(using=self._db):
            user = self.model(email=email, **extra_fields)
            user.set_password(password)
            user.save(using=self._db)
            create_me_person(user, name or email.split("@")[0])
        return user

    def create_superuser(
        self, email: str, password: str | None = None, name: str | None = None, **extra_fields
    ) -> "User":
        extra_fields["is_staff"] = True
        extra_fields["is_superuser"] = True
        return self.create_user(email, password, name, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """An account on this FolkBook server.

    The person's own details (name, photo, birthday) live on their "Me" person
    (`user.me`), so they show up in the graph like everyone else.
    `is_staff` marks server admins.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique"),
        ]

    def __str__(self) -> str:
        return self.email
