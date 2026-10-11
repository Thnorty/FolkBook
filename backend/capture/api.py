from uuid import UUID

from django.shortcuts import get_object_or_404
from ninja import Router, Status

from ai.client import AiError
from capture import draft, save
from capture.models import Capture
from capture.schemas import DraftOut, SavedOut, SaveIn, SuggestIn, UndoneOut
from core.api import ErrorOut, access_for

router = Router(tags=["capture"])

# 424: the AI this capture depends on failed. A 4xx, so the app shows these words; it
# shows only its own for a 5xx.
AI_FAILED = 424


@router.post("/suggest", response={200: DraftOut, 409: ErrorOut, AI_FAILED: ErrorOut})
def suggest(request, payload: SuggestIn):
    """Read `text` with your AI (or the server's) and match it to your people.

    Only the text and today's date go to the AI. Nothing is saved.
    """
    try:
        return draft.suggest(access_for(request), payload)
    except AiError as error:
        return Status(AI_FAILED, {"detail": error.message})


@router.post("/save", response={201: SavedOut})
def save_capture(request, payload: SaveIn):
    """Save the reviewed capture at once, checked like anything typed in a form: if one
    part isn't allowed, nothing is saved."""
    capture, created, matched = save.save_capture(access_for(request), payload)
    return Status(
        201,
        {
            "capture_id": capture.pk,
            "added": {
                "people": len(capture.people),
                "connections": len(capture.relationships),
                "memory_aids": len(capture.memory_aids),
                "entries": len(capture.interactions),
                "changes": len(capture.changes),
            },
            "matched": [person.name for person in matched],
            "people": [{"id": p.pk, "name": p.name, "new": True} for p in created]
            + [{"id": p.pk, "name": p.name, "new": False} for p in matched],
        },
    )


@router.post("/{uuid:capture_id}/undo", response=UndoneOut)
def undo_capture(request, capture_id: UUID):
    """Undo all of this: only yours (anyone else's is not found), and only once (409)."""
    capture = get_object_or_404(Capture, pk=capture_id, owner=request.auth)
    return save.undo_capture(access_for(request), capture)
