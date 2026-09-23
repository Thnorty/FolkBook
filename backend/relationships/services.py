from people.models import Person
from relationships.models import DIRECTIONAL_TYPES, RelationshipType


def stored_order(type: RelationshipType | str, a: Person, b: Person) -> tuple[Person, Person]:
    """Return (person_a, person_b) the way the link must be stored.

    Directional links keep their order ("a is the parent of b"). Symmetric links
    are stored once, lowest id first, so "a, b" and "b, a" can't both exist.
    """
    if type in DIRECTIONAL_TYPES or a.pk < b.pk:
        return a, b
    return b, a
