from ninja import Router, Status

from ai.client import AiError
from capture import draft
from capture.schemas import DraftOut, SuggestIn
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
