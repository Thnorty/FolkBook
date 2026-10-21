"""iCalendar text (RFC 5545) for calendar feeds: just the all-day events they need."""

import datetime
import unicodedata
from dataclasses import dataclass

# Calendar apps ask again after this long (some honor one hint, some the other).
REFRESH = "PT6H"
LINE_OCTETS = 75
# Read as the end of a line by some parsers (Python's splitlines among them).
LINE_BREAKS = {"\n", "\r", "\x0b", "\x0c", "\x1c", "\x1d", "\x1e", "\x85", "\u2028", "\u2029"}


@dataclass(frozen=True)
class Event:
    uid: str
    day: datetime.date
    summary: str


def escape(text: str) -> str:
    """Text as a property value: backslashes, commas, semicolons and line breaks escaped.

    Anything a parser might read as the end of a line (a bare carriage return, Unicode's
    line and paragraph separators) counts as a line break too, and other control characters
    are dropped: either could end the line early and let a name add properties or events."""
    text = text.replace("\r\n", "\n")
    text = "".join(_plain(char) for char in text)
    for char, escaped in (("\\", "\\\\"), (";", "\\;"), (",", "\\,"), ("\n", "\\n")):
        text = text.replace(char, escaped)
    return text


def _plain(char: str) -> str:
    if char in LINE_BREAKS:
        return "\n"
    if char == "\t":
        return char
    return "" if unicodedata.category(char) == "Cc" else char


def fold(line: str) -> str:
    """Breaks a line longer than 75 octets into a first line and continuation lines that
    start with a space, never in the middle of a character."""
    parts = []
    limit = LINE_OCTETS
    while len(line.encode()) > limit:
        cut = limit
        # Back off until the first `cut` octets end on a whole character.
        while len(line[:cut].encode()) > limit:
            cut -= 1
        parts.append(line[:cut])
        line = line[cut:]
        limit = LINE_OCTETS - 1  # room for the leading space
    parts.append(line)
    return "\r\n ".join(parts)


def calendar(name: str, events: list[Event], now: datetime.datetime) -> str:
    """A whole calendar: its name and refresh hints, then one all-day event each."""
    stamp = now.astimezone(datetime.UTC).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//FolkBook//Calendar feed//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape(f'FolkBook · {name}')}",
        f"REFRESH-INTERVAL;VALUE=DURATION:{REFRESH}",
        f"X-PUBLISHED-TTL:{REFRESH}",
    ]
    for event in events:
        lines += [
            "BEGIN:VEVENT",
            f"UID:{event.uid}",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{event.day:%Y%m%d}",
            f"DTEND;VALUE=DATE:{event.day + datetime.timedelta(days=1):%Y%m%d}",
            f"SUMMARY:{escape(event.summary)}",
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "".join(fold(line) + "\r\n" for line in lines)
