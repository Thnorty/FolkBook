import datetime

from ninja import Field, Schema

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
    """Keep-in-touch settings for everyone."""

    nudges_on: bool = True
    default_interval_days: int | None = Field(None, ge=1, le=3650)  # None: own intervals only


class NudgeOut(Schema):
    """Someone it's time to get in touch with."""

    person: PersonRef
    interval_days: int
    days_since: int
    last_talked_on: datetime.date | None
    hint: str
