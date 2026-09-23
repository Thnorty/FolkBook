"""Test data factories. Use these instead of building models by hand in tests."""

import datetime

import factory

from accounts.models import User
from interactions.models import Interaction
from people.models import ContactMethod, MemoryAid, Note, Person, Tag
from relationships.models import Relationship
from relationships.services import stored_order
from reminders.models import KeepInTouch
from spaces.models import Space, SpaceMembership

PASSWORD = "a long enough passphrase"


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        # The manager also creates the user's "Me" person.
        kwargs.setdefault("password", PASSWORD)
        return model_class.objects.create_user(*args, **kwargs)


class PersonFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Person
        skip_postgeneration_save = True

    owner = factory.SubFactory(UserFactory)
    name = factory.Faker("name")


class TagFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Tag

    owner = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"tag {n}")


class ContactMethodFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ContactMethod

    person = factory.SubFactory(PersonFactory)
    kind = ContactMethod.Kind.PHONE
    value = "+90 532 000 00 00"


class NoteFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Note

    person = factory.SubFactory(PersonFactory)
    author = factory.SelfAttribute("person.owner")
    body = "Wants to move back to Izmir eventually."


class MemoryAidFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MemoryAid

    person = factory.SubFactory(PersonFactory)
    author = factory.SelfAttribute("person.owner")
    text = "Kid: Arda, 6 — dinosaurs"


class SpaceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Space

    owner = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"Space {n}")


class SpaceMembershipFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = SpaceMembership

    space = factory.SubFactory(SpaceFactory)
    user = factory.SubFactory(UserFactory)


class RelationshipFactory(factory.django.DjangoModelFactory):
    """A friendship by default, stored in the order the database requires."""

    class Meta:
        model = Relationship

    owner = factory.SubFactory(UserFactory)
    person_a = factory.SubFactory(PersonFactory, owner=factory.SelfAttribute("..owner"))
    person_b = factory.SubFactory(PersonFactory, owner=factory.SelfAttribute("..owner"))
    type = Relationship.Type.FRIEND

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        kwargs["person_a"], kwargs["person_b"] = stored_order(
            kwargs["type"], kwargs["person_a"], kwargs["person_b"]
        )
        return super()._create(model_class, *args, **kwargs)


class InteractionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Interaction

    person = factory.SubFactory(PersonFactory)
    author = factory.SelfAttribute("person.owner")
    kind = Interaction.Kind.MET
    occurred_on = datetime.date(2026, 9, 12)


class KeepInTouchFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = KeepInTouch

    person = factory.SubFactory(PersonFactory)
    user = factory.SelfAttribute("person.owner")
