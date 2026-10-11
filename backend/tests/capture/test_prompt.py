"""Asking the AI what a capture mentions, and cleaning up its answer."""

import datetime
import json

import pytest

from ai.client import AiError, Target
from capture.prompt import CAPTURE_SCHEMA, read_capture

TODAY = datetime.date(2026, 10, 11)
TEXT = "Met Tom at the hackathon, he's Emma's cousin, likes climbing, coffee yesterday"


def answer(**parts) -> str:
    return json.dumps({"people": [], "connections": [], "memory_aids": [], "entries": []} | parts)


def person(ref: str, name: str, **fields) -> dict:
    return {
        "ref": ref,
        "name": name,
        "how_we_met": None,
        "work": None,
        "birthday": None,
        "tags": [],
    } | fields


TOM = person("t", "Tom", how_we_met="At the hackathon", work="Spotify", tags=["climbing"])
EMMA = person("e", "Emma")


@pytest.fixture
def target(stub_ai):
    return Target(stub_ai.url, "sk-test", "test-model")


def test_only_the_text_and_today_go_to_the_ai(stub_ai, target):
    stub_ai.chat_reply(answer())

    read_capture(target, TEXT, TODAY)

    body = stub_ai.requests[0]["json"]
    users = [m["content"] for m in body["messages"] if m["role"] == "user"]
    assert users == [f"Today is 2026-10-11.\n\n{TEXT}"]
    assert [m["role"] for m in body["messages"]] == ["system", "user"]
    assert body["response_format"]["json_schema"]["schema"] == CAPTURE_SCHEMA


def test_reads_people_connections_aids_and_entries(stub_ai, target):
    stub_ai.chat_reply(
        answer(
            people=[TOM, EMMA],
            connections=[{"a": "t", "b": "e", "type": "cousin", "label": None}],
            memory_aids=[{"about": "t", "text": "Likes climbing"}],
            entries=[
                {
                    "about": "t",
                    "kind": "met",
                    "date": "2026-10-10",
                    "label": "Coffee",
                    "note": "Coffee after the hackathon",
                }
            ],
        )
    )

    draft = read_capture(target, TEXT, TODAY)

    assert [(p["ref"], p["name"], p["work"]) for p in draft.people] == [
        ("p1", "Tom", "Spotify"),
        ("p2", "Emma", None),
    ]
    assert draft.people[0]["tags"] == ["climbing"]
    assert draft.connections == [{"a": "p1", "b": "p2", "type": "cousin", "label": ""}]
    assert draft.memory_aids == [{"about": "p1", "text": "Likes climbing"}]
    assert draft.entries == [
        {
            "about": "p1",
            "kind": "met",
            "date": datetime.date(2026, 10, 10),
            "label": "Coffee",
            "note": "Coffee after the hackathon",
        }
    ]


def test_inconsistent_parts_are_dropped(stub_ai, target):
    stub_ai.chat_reply(
        answer(
            people=[TOM, EMMA, person("x", "  "), person("t", "Tom again")],
            connections=[
                {"a": "t", "b": "e", "type": "cousin", "label": None},
                {"a": "t", "b": "x9", "type": "friend", "label": None},
                {"a": "me", "b": "t", "type": "boss", "label": None},
                {"a": "t", "b": "t", "type": "friend", "label": None},
                {"a": "me", "b": "e", "type": "met_at", "label": None},
                {"a": "me", "b": "t", "type": "friend", "label": None},
            ],
            memory_aids=[
                {"about": "t", "text": "Likes climbing"},
                {"about": "nobody", "text": "Secret"},
                {"about": "e", "text": "   "},
            ],
            entries=[
                {"about": "x", "kind": "met", "date": "2026-10-10", "label": None, "note": ""},
                {"about": "e", "kind": "dance", "date": "2026-10-10", "label": None, "note": ""},
                {"about": "e", "kind": "call", "date": "someday", "label": None, "note": ""},
            ],
        )
    )

    draft = read_capture(target, TEXT, TODAY)

    assert [p["name"] for p in draft.people] == ["Tom", "Emma"]
    assert draft.connections == [
        {"a": "p1", "b": "p2", "type": "cousin", "label": ""},
        {"a": "me", "b": "p1", "type": "friend", "label": ""},
    ]
    assert draft.memory_aids == [{"about": "p1", "text": "Likes climbing"}]
    assert draft.entries == []


def test_other_entries_get_a_title(stub_ai, target):
    stub_ai.chat_reply(
        answer(
            people=[EMMA],
            entries=[
                {"about": "e", "kind": "custom", "date": "2026-10-10", "label": None, "note": ""}
            ],
        )
    )

    draft = read_capture(target, TEXT, TODAY)

    assert draft.entries[0]["kind"] == "custom"
    assert draft.entries[0]["label"] == "Other"


def test_future_dates_become_today(stub_ai, target):
    stub_ai.chat_reply(
        answer(
            people=[EMMA],
            entries=[
                {"about": "e", "kind": "call", "date": "2026-12-01", "label": None, "note": ""}
            ],
        )
    )

    draft = read_capture(target, TEXT, TODAY)

    assert draft.entries[0]["date"] == TODAY


def test_birthdays_with_or_without_a_year(stub_ai, target):
    stub_ai.chat_reply(
        answer(
            people=[
                person("a", "Ana", birthday="1990-04-03"),
                person("b", "Bo", birthday="--04-03"),
                person("c", "Cem", birthday="soon"),
                person("d", "Dua", birthday="2001-02-30"),
            ]
        )
    )

    draft = read_capture(target, TEXT, TODAY)

    assert [p["birthday"] for p in draft.people] == [
        {"day": 3, "month": 4, "year": 1990},
        {"day": 3, "month": 4, "year": None},
        None,
        None,
    ]


def test_nonsense_is_asked_again_then_refused(stub_ai, target):
    stub_ai.chat_reply("not json")
    stub_ai.chat_reply(answer(people=[EMMA]))

    draft = read_capture(target, TEXT, TODAY)

    assert [p["name"] for p in draft.people] == ["Emma"]
    assert len(stub_ai.requests) == 2

    stub_ai.chat_reply("not json")
    stub_ai.chat_reply(json.dumps({"people": "everyone"}))
    with pytest.raises(AiError) as error:
        read_capture(target, TEXT, TODAY)
    assert error.value.kind == "bad_answer"
    assert error.value.message == "The AI's answer didn't make sense. Try again."


def test_birthday_years_outside_the_calendar_are_left_out(stub_ai, target):
    stub_ai.chat_reply(
        answer(
            people=[
                person("a", "Ana", birthday="0000-04-03"),
                person("b", "Bo", birthday="1750-04-03"),
                person("c", "Cem", birthday="9999-12-31"),
            ]
        )
    )

    draft = read_capture(target, TEXT, TODAY)

    assert [p["birthday"] for p in draft.people] == [
        {"day": 3, "month": 4, "year": None},
        {"day": 3, "month": 4, "year": None},
        {"day": 31, "month": 12, "year": None},
    ]


def test_refs_are_the_servers_own(stub_ai, target):
    # The AI's refs could clash with "me" or the draft's own ids (c1, m1, e1).
    stub_ai.chat_reply(
        answer(
            people=[person("me", "Ela"), person("c1", "Tom"), person("e1", "Emma")],
            connections=[
                {"a": "c1", "b": "e1", "type": "cousin", "label": None},
                {"a": "me", "b": "c1", "type": "friend", "label": None},
            ],
            memory_aids=[{"about": "c1", "text": "Likes climbing"}],
        )
    )

    draft = read_capture(target, TEXT, TODAY)

    assert [(p["ref"], p["name"]) for p in draft.people] == [("p1", "Tom"), ("p2", "Emma")]
    assert [(c["a"], c["b"]) for c in draft.connections] == [("p1", "p2"), ("me", "p1")]
    assert draft.memory_aids == [{"about": "p1", "text": "Likes climbing"}]


def test_long_values_are_cut_to_what_can_be_saved(stub_ai, target):
    stub_ai.chat_reply(
        answer(
            people=[
                person(
                    "t",
                    "T" * 250,
                    how_we_met="h" * 400,
                    work="w" * 250,
                    tags=["climbing", "x" * 60],
                )
            ],
            connections=[{"a": "me", "b": "t", "type": "met_at", "label": "l" * 250}],
            memory_aids=[{"about": "t", "text": "m" * 400}],
            entries=[
                {"about": "t", "kind": "met", "date": "2026-10-10", "label": "c" * 150, "note": "n"}
            ],
        )
    )

    draft = read_capture(target, TEXT, TODAY)

    tom = draft.people[0]
    assert (len(tom["name"]), len(tom["how_we_met"]), len(tom["work"])) == (200, 300, 200)
    assert tom["tags"] == ["climbing"]
    assert len(draft.connections[0]["label"]) == 200
    assert len(draft.memory_aids[0]["text"]) == 300
    assert len(draft.entries[0]["label"]) == 100
