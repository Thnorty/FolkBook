import datetime
from uuid import UUID

from ninja import Field, Schema

from accounts.devices import describe_device
from people.schemas import PersonRef


class CurrentUserOut(Schema):
    id: UUID
    email: str
    is_admin: bool
    me: PersonRef | None  # the user's own person: name, and where to find their profile

    @staticmethod
    def resolve_is_admin(obj):
        return obj.is_staff

    @staticmethod
    def resolve_me(obj):
        return getattr(obj, "me", None)


class LoginIn(Schema):
    email: str = Field(max_length=254)
    password: str = Field(max_length=4096)
    remember: bool = True  # "Keep me logged in on this device"


class PasswordIn(Schema):
    current_password: str = Field(max_length=4096)
    new_password: str = Field(max_length=4096)


class CsrfOut(Schema):
    csrf_token: str


class DeviceOut(Schema):
    id: UUID
    device: str  # "Firefox on macOS"
    ip: str | None
    last_seen: datetime.datetime
    is_current: bool

    @staticmethod
    def resolve_device(obj):
        return describe_device(obj.user_agent)

    @staticmethod
    def resolve_is_current(obj, context):
        return obj.session_key == context["request"].session.session_key
