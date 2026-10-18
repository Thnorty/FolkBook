import datetime
from functools import cache
from typing import Literal
from zoneinfo import available_timezones

from ninja import Field, Schema
from pydantic import field_validator

from people.schemas import PersonRef


class KeepInTouchSchema(Schema):
    """The user's keep-in-touch setting for one person."""

    interval_days: int | None = Field(None, ge=1, le=3650)  # None: the user's default
    snoozed_until: datetime.date | None = None
    stopped: bool = False  # "Stop reminding me"


class KeepInTouchOut(KeepInTouchSchema):
    """The setting, and what it works out to."""

    default_interval_days: int | None  # the user's default, which `interval_days: None` uses
    next_nudge_on: datetime.date | None  # None: they won't come up (no interval, or stopped)


class ReminderSettingsSchema(Schema):
    """Reminder settings for everyone: nudges, and the email digest."""

    nudges_on: bool = True
    default_interval_days: int | None = Field(None, ge=1, le=3650)  # None: own intervals only
    digest: Literal["off", "daily", "weekly"] = "weekly"
    digest_weekday: int = Field(0, ge=0, le=6)  # 0 is Monday
    include_memory_aids: bool = True
    birthdays_days_before: int | None = Field(3, ge=0, le=30)  # None: no birthdays
    time_zone: str = Field("", max_length=64)  # the browser's, e.g. "Europe/Istanbul"

    @field_validator("time_zone")
    @classmethod
    def known_time_zone(cls, value: str) -> str:
        if value and value not in _time_zones():
            raise ValueError("Unknown time zone.")
        return value


class ReminderSettingsOut(ReminderSettingsSchema):
    email_ready: bool  # without email, the digest settings do nothing
    send_to: str  # where the digest goes: the account's email


class DigestTestOut(Schema):
    ok: bool
    message: str


class NudgeOut(Schema):
    """Someone it's time to get in touch with."""

    person: PersonRef
    interval_days: int
    days_since: int
    last_talked_on: datetime.date | None
    hint: str


@cache
def _time_zones() -> set[str]:
    return available_timezones()
