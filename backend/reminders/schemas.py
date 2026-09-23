import datetime

from ninja import Field, Schema


class KeepInTouchSchema(Schema):
    """The user's keep-in-touch setting for one person."""

    interval_days: int | None = Field(None, ge=1, le=3650)  # None: the user's default
    snoozed_until: datetime.date | None = None
    stopped: bool = False  # "Stop reminding me"
