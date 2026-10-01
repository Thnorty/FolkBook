import datetime

from ninja import Schema

from people.schemas import MemoryAidOut, PersonOut, PersonRef


class BirthdayOut(Schema):
    person: PersonOut
    on: datetime.date  # the coming birthday, this year or next
    turns: int | None  # None when the year is unknown


class RememberOut(Schema):
    """One of your memory aids, picked at random: "Remember? Emma's kid is Arda"."""

    aid: MemoryAidOut
    person: PersonRef
