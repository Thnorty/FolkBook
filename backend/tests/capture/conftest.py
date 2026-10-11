import pytest


@pytest.fixture
def tom_and_emma(world) -> dict:
    """A reviewed capture: new Tom in Climbing club, a new job for Ela's Emma, their link,
    a memory aid on Tom and coffee with Emma yesterday."""
    world.emma.work = "Google"
    world.emma.save()
    return {
        "space_id": str(world.climbing.pk),
        "new_people": [
            {
                "ref": "t",
                "name": "Tom Berg",
                "how_we_met": "At the hackathon",
                "work": "Designer at Spotify",
                "tags": ["climbing"],
            }
        ],
        "existing_people": [
            {"ref": "e", "person_id": str(world.emma.pk), "changes": {"work": "Spotify"}}
        ],
        "connections": [{"a": "t", "b": "e", "type": "cousin"}],
        "memory_aids": [{"about": "t", "text": "Likes climbing"}],
        "entries": [{"about": "e", "kind": "met", "date": "2026-10-10", "label": "Coffee"}],
    }
