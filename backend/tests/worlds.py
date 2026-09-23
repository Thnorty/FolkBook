"""A small shared world for privacy and graph tests, modelled on the design's sample data.

Users
- Ela: owns the "Climbing club" space, shared with Deniz (editor) and Kaan (viewer).
- Defne: owns "Hackathon 2026", shared with Ela (viewer).
- Deniz, Kaan: members of Climbing club.
- Sofia: on the same server, but nothing is shared with her.

People
- Ela's book: Emma (in no space), Oskar and Ines (in Climbing club; Ines has a phone number).
- Defne's book: Tom and Ola (in Hackathon 2026), Jin (in no space).
- Deniz's book: Yuki (in no space, yet).

Links
- Ela: Emma–Oskar friend, private (no space).
- Ela: Oskar–Ines friend, in Climbing club.
- Ela: Oskar–Emma colleague, in Climbing club (but Emma isn't in the space).
- Defne: Tom–Ola friend, in Hackathon 2026.
- Defne: Tom–Jin cousin, private.

Private data
- Ela: a note, a memory aid, an interaction and a reminder on Oskar.
- Deniz: a note on Oskar.
- Defne: a note on Jin.
"""

from dataclasses import dataclass

import pytest

from accounts.models import User
from people.models import Person
from relationships.models import Relationship
from spaces.models import Space
from tests.factories import (
    ContactMethodFactory,
    InteractionFactory,
    KeepInTouchFactory,
    MemoryAidFactory,
    NoteFactory,
    PersonFactory,
    RelationshipFactory,
    SpaceFactory,
    SpaceMembershipFactory,
    UserFactory,
)


@dataclass
class World:
    ela: User
    defne: User
    deniz: User
    kaan: User
    sofia: User
    climbing: Space
    hackathon: Space
    emma: Person
    oskar: Person
    ines: Person
    tom: Person
    ola: Person
    jin: Person
    yuki: Person
    emma_oskar_private: Relationship
    oskar_ines: Relationship
    oskar_emma_in_climbing: Relationship
    tom_ola: Relationship
    tom_jin_private: Relationship


@pytest.fixture
def world(db) -> World:
    ela = UserFactory(email="ela@example.com", name="Ela")
    defne = UserFactory(email="defne@example.com", name="Defne")
    deniz = UserFactory(email="deniz@example.com", name="Deniz")
    kaan = UserFactory(email="kaan@example.com", name="Kaan")
    sofia = UserFactory(email="sofia@example.com", name="Sofia")

    climbing = SpaceFactory(owner=ela, name="Climbing club")
    SpaceMembershipFactory(space=climbing, user=deniz, role="editor")
    SpaceMembershipFactory(space=climbing, user=kaan, role="viewer")
    hackathon = SpaceFactory(owner=defne, name="Hackathon 2026")
    SpaceMembershipFactory(space=hackathon, user=ela, role="viewer")

    emma = PersonFactory(owner=ela, name="Emma")
    oskar = PersonFactory(owner=ela, name="Oskar")
    ines = PersonFactory(owner=ela, name="Ines")
    climbing.people.add(oskar, ines)
    ContactMethodFactory(person=ines, value="+46 70 555 12 90")

    tom = PersonFactory(owner=defne, name="Tom")
    ola = PersonFactory(owner=defne, name="Ola")
    jin = PersonFactory(owner=defne, name="Jin")
    hackathon.people.add(tom, ola)

    yuki = PersonFactory(owner=deniz, name="Yuki")

    world = World(
        ela=ela,
        defne=defne,
        deniz=deniz,
        kaan=kaan,
        sofia=sofia,
        climbing=climbing,
        hackathon=hackathon,
        emma=emma,
        oskar=oskar,
        ines=ines,
        tom=tom,
        ola=ola,
        jin=jin,
        yuki=yuki,
        emma_oskar_private=RelationshipFactory(owner=ela, person_a=emma, person_b=oskar),
        oskar_ines=RelationshipFactory(owner=ela, person_a=oskar, person_b=ines, space=climbing),
        oskar_emma_in_climbing=RelationshipFactory(
            owner=ela, person_a=oskar, person_b=emma, type="colleague", space=climbing
        ),
        tom_ola=RelationshipFactory(owner=defne, person_a=tom, person_b=ola, space=hackathon),
        tom_jin_private=RelationshipFactory(owner=defne, person_a=tom, person_b=jin, type="cousin"),
    )

    NoteFactory(author=ela, person=oskar)
    MemoryAidFactory(author=ela, person=oskar)
    InteractionFactory(author=ela, person=oskar)
    KeepInTouchFactory(user=ela, person=oskar)
    NoteFactory(author=deniz, person=oskar)
    NoteFactory(author=defne, person=jin)
    return world
