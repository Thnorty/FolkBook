import datetime
from uuid import UUID

from ninja import Schema

from people.models import AccessEnded
from people.schemas import MemoryAidOut, PersonOut, PersonRef


class BirthdayOut(Schema):
    person: PersonOut
    on: datetime.date  # the coming birthday, this year or next
    turns: int | None  # None when the year is unknown


class RememberOut(Schema):
    """One of your memory aids, picked at random: "Remember? Emma's kid is Arda"."""

    aid: MemoryAidOut
    person: PersonRef


class AccessEndedOut(Schema):
    """People left your book because of someone else (screen 4n). The app words it:
    "Defne stopped sharing Hackathon 2026. You kept 3 people you had notes on."
    """

    id: UUID
    reason: AccessEnded.Reason
    by: str  # who did it
    space: str  # the space it was about, if any
    about: str  # the member who left, or the person taken out or deleted
    lost: int  # people who left your book, kept ones included
    kept: list[PersonRef]  # your copies
    at: datetime.datetime
    toasted: bool  # already shown as a toast, on any of your devices

    @staticmethod
    def resolve_lost(obj):
        return obj.lost_count

    @staticmethod
    def resolve_kept(obj):
        return obj.kept_shown

    @staticmethod
    def resolve_at(obj):
        return obj.created_at
