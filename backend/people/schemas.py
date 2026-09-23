from uuid import UUID

from ninja import Field, Schema

from people.models import ContactMethod


class Birthday(Schema):
    day: int = Field(ge=1, le=31)
    month: int = Field(ge=1, le=12)
    year: int | None = Field(None, ge=1800, le=2200)


class PersonRef(Schema):
    id: UUID
    name: str


class SpaceRef(Schema):
    id: UUID
    name: str
    color: str


class ContactMethodIn(Schema):
    kind: ContactMethod.Kind
    label: str = Field("", max_length=50)
    value: str = Field(min_length=1, max_length=255)


class ContactMethodOut(ContactMethodIn):
    id: UUID


class PersonOut(Schema):
    """The basic profile, as the viewer is allowed to see it."""

    id: UUID
    name: str
    how_we_met: str
    work: str
    birthday: Birthday | None
    tags: list[str]
    spaces: list[SpaceRef]  # only spaces the viewer can see
    is_me: bool  # the viewer's own Me
    is_mine: bool  # owned by the viewer
    owner: PersonRef | None  # the owner's Me, e.g. "Shared by Defne"

    @staticmethod
    def resolve_birthday(obj):
        if obj.birth_day is None:
            return None
        return {"day": obj.birth_day, "month": obj.birth_month, "year": obj.birth_year}

    @staticmethod
    def resolve_tags(obj):
        return sorted((tag.name for tag in obj.tags.all()), key=str.casefold)

    @staticmethod
    def resolve_spaces(obj):
        return obj.shown_spaces

    @staticmethod
    def resolve_is_me(obj, context):
        return obj.account_id == context["request"].auth.pk

    @staticmethod
    def resolve_is_mine(obj, context):
        return obj.owner_id == context["request"].auth.pk

    @staticmethod
    def resolve_owner(obj):
        return getattr(obj.owner, "me", None)


class PersonDetailOut(PersonOut):
    contact_methods: list[ContactMethodOut]  # empty unless the viewer may see them
    can_edit: bool
    can_delete: bool

    @staticmethod
    def resolve_contact_methods(obj):
        # Never `obj.contact_methods`: that's every number, not the visible ones.
        return obj.contact_methods_shown


class PersonIn(Schema):
    name: str = Field(min_length=1, max_length=200)
    how_we_met: str = Field("", max_length=300)
    work: str = Field("", max_length=200)
    birthday: Birthday | None = None
    tags: list[str] = []
    contact_methods: list[ContactMethodIn] = []
    space_ids: list[UUID] = []


class PersonPatch(Schema):
    """Only the fields sent are changed. Tags and contact details: owner only."""

    name: str | None = Field(None, min_length=1, max_length=200)
    how_we_met: str | None = Field(None, max_length=300)
    work: str | None = Field(None, max_length=200)
    birthday: Birthday | None = None
    tags: list[str] | None = None
    contact_methods: list[ContactMethodIn] | None = None
