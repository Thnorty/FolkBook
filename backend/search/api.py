from ninja import Field, Query, Router, Schema

from core.api import access_for
from people.api import people_for
from search import search
from search.schemas import SearchOut
from spaces.api import spaces_for

router = Router(tags=["search"])


class SearchParams(Schema):
    q: str = Field(min_length=1, max_length=200)


@router.get("", response=SearchOut)
def search_everything(request, params: Query[SearchParams]):
    """People, spaces, your memory aids and your notes matching `q`, a few of each.

    Only what you can see; other people's notes and memory aids never match.
    """
    access = access_for(request)
    text = params.q.strip()
    people = list(search.matching_people(access, people_for(access), text))
    return {
        "people": people,
        "spaces": search.matching_spaces(spaces_for(access), text),
        "memory_aids": [
            {"id": aid.id, "text": aid.text, "person": aid.person}
            for aid in search.matching_memory_aids(access, text)
        ],
        "notes": search.matching_notes(access, text),
        "did_you_mean": None if people else search.did_you_mean(access, text),
    }
