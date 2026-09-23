from django.conf import settings
from django.db import models

from core.models import BaseModel
from people.models import Person
from spaces.models import Space


class RelationshipType(models.TextChoices):
    PARENT = "parent"
    PARTNER = "partner"
    SIBLING = "sibling"
    COUSIN = "cousin"
    GRANDPARENT = "grandparent"
    AUNT_UNCLE = "aunt_uncle", "Aunt / uncle"
    FRIEND = "friend"
    COLLEAGUE = "colleague"
    CLASSMATE = "classmate"
    MET_AT = "met_at", "Met at"
    CUSTOM = "custom"


class ParentType(models.TextChoices):
    BIOLOGICAL = "biological"
    ADOPTIVE = "adoptive"
    STEP = "step"


# "person_a is the <type> of person_b"; every other type is symmetric.
DIRECTIONAL_TYPES = frozenset(
    {RelationshipType.PARENT, RelationshipType.GRANDPARENT, RelationshipType.AUNT_UNCLE}
)
# Family links stored directly when the people connecting them are unknown.
OTHER_FAMILY_TYPES = frozenset(
    {
        RelationshipType.SIBLING,
        RelationshipType.COUSIN,
        RelationshipType.GRANDPARENT,
        RelationshipType.AUNT_UNCLE,
    }
)
FAMILY_TYPES = OTHER_FAMILY_TYPES | {RelationshipType.PARENT, RelationshipType.PARTNER}
LABELLED_TYPES = frozenset({RelationshipType.MET_AT, RelationshipType.CUSTOM})


def _values(types: frozenset[RelationshipType]) -> list[str]:
    return sorted(str(t) for t in types)


class Relationship(BaseModel):
    """A stored link between two people.

    Only these are stored: parents, partners, "other family" links for when the
    connecting people are unknown, and social links. Everything else in the
    family (siblings via parents, cousins, in-laws) is derived, never stored.

    Directional types read "person_a is the <type> of person_b" (e.g. A is the
    parent of B). Symmetric types are stored once, with person_a < person_b.
    """

    Type = RelationshipType
    ParentType = ParentType

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="relationships"
    )
    # Visibility follows the space; without one, only the owner sees the link.
    space = models.ForeignKey(
        Space, on_delete=models.SET_NULL, null=True, blank=True, related_name="relationships"
    )
    person_a = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="+")
    person_b = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="+")
    type = models.CharField(max_length=20, choices=RelationshipType.choices)
    parent_type = models.CharField(max_length=20, choices=ParentType.choices, blank=True)
    label = models.CharField(max_length=200, blank=True)
    started_on = models.DateField(null=True, blank=True)
    ended_on = models.DateField(null=True, blank=True)
    is_former = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(person_a=models.F("person_b")),
                name="relationships_not_with_self",
                violation_error_message="A person can't be linked to themselves.",
            ),
            models.CheckConstraint(
                condition=models.Q(type__in=_values(DIRECTIONAL_TYPES))
                | models.Q(person_a__lt=models.F("person_b")),
                name="relationships_symmetric_stored_once",
            ),
            models.CheckConstraint(
                condition=models.Q(type="parent", parent_type__in=ParentType.values)
                | (~models.Q(type="parent") & models.Q(parent_type="")),
                name="relationships_parent_type_only_on_parents",
                violation_error_message=(
                    "Parent links need a parent type (biological, adoptive or step), "
                    "and only parent links have one."
                ),
            ),
            models.CheckConstraint(
                condition=~models.Q(type__in=_values(LABELLED_TYPES)) | ~models.Q(label=""),
                name="relationships_label_required",
                violation_error_message="“Met at” and custom links need a label.",
            ),
            models.CheckConstraint(
                condition=~models.Q(type="parent", is_former=True),
                name="relationships_parent_links_never_end",
                violation_error_message="Parent links never end.",
            ),
            models.CheckConstraint(
                condition=models.Q(ended_on__isnull=True) | models.Q(is_former=True),
                name="relationships_end_date_means_former",
                violation_error_message="Only ended links have an end date.",
            ),
            models.UniqueConstraint(
                fields=["owner", "person_a", "person_b", "type"],
                condition=models.Q(is_former=False),
                name="relationships_one_current_link_per_type",
                violation_error_message="This link already exists.",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.person_a} — {self.get_type_display()} — {self.person_b}"

    @property
    def is_family(self) -> bool:
        return self.type in FAMILY_TYPES
