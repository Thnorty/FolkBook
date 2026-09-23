from django.db.models.functions import Collate

# The database's default collation sorts "ayla" and "Émile" after "Zeynep".
# ICU's root collation sorts names the way people expect, in any language.
NAME_COLLATION = "und-x-icu"


def by_name(field: str = "name") -> Collate:
    """Order-by expression for human names: `queryset.order_by(by_name())`."""
    return Collate(field, NAME_COLLATION)
