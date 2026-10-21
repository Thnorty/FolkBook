"""Writing iCalendar text (RFC 5545) for calendar feeds."""

import datetime

from calendars.ics import Event, calendar, escape, fold

NOW = datetime.datetime(2026, 10, 21, 9, 0, tzinfo=datetime.UTC)


def test_text_is_escaped():
    assert escape("A, B; C\\ D\nE") == "A\\, B\\; C\\\\ D\\nE"


def test_carriage_returns_and_control_characters_cant_start_a_line():
    # A bare CR is a line break to some calendar apps: it would let a name add properties.
    assert escape("Ann\r\nLee") == "Ann\\nLee"
    assert escape("Ann\rBEGIN:VEVENT") == "Ann\\nBEGIN:VEVENT"
    assert escape("A\x00B\x07C\x7fD\tE") == "ABCD\tE"


def test_unicode_line_breaks_and_c1_controls_cant_start_a_line_either():
    # Some parsers split on these too (Python's splitlines does).
    assert escape("A\u0085B\u2028C\u2029D") == "A\\nB\\nC\\nD"
    assert escape("A\x80B\x9fC") == "ABC"


def test_long_lines_fold_at_75_octets_without_splitting_a_letter():
    line = "SUMMARY:" + "Ş" * 40

    folded = fold(line)

    physical = folded.split("\r\n")
    assert len(physical) > 1
    assert all(len(part.encode()) <= 75 for part in physical)
    assert all(part.startswith(" ") for part in physical[1:])
    assert folded.replace("\r\n ", "") == line


def test_an_event_is_all_day_and_transparent():
    text = calendar(
        "Family",
        [Event("birthday-x-2026@folkbook", datetime.date(2026, 10, 20), "🎂 Selin turns 35")],
        NOW,
    )

    assert "DTSTART;VALUE=DATE:20261020\r\n" in text
    assert "DTEND;VALUE=DATE:20261021\r\n" in text
    assert "TRANSP:TRANSPARENT\r\n" in text
    assert "UID:birthday-x-2026@folkbook\r\n" in text
    assert "DTSTAMP:20261021T090000Z\r\n" in text
    assert "SUMMARY:🎂 Selin turns 35\r\n" in text


def test_names_with_commas_and_semicolons_stay_valid():
    text = calendar(
        "Friends; old",
        [Event("u@folkbook", datetime.date(2026, 10, 20), "🎂 Lee, Ann's birthday")],
        NOW,
    )

    assert "SUMMARY:🎂 Lee\\, Ann's birthday\r\n" in text
    assert "X-WR-CALNAME:FolkBook · Friends\\; old\r\n" in text


def test_the_calendar_has_its_name_and_refresh_hints_and_crlf():
    text = calendar("Family", [], NOW)

    assert text.startswith("BEGIN:VCALENDAR\r\n")
    assert text.endswith("END:VCALENDAR\r\n")
    for line in (
        "VERSION:2.0",
        "PRODID:-//FolkBook//Calendar feed//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:FolkBook · Family",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
    ):
        assert f"\r\n{line}\r\n" in text
    assert "\n" not in text.replace("\r\n", "")
