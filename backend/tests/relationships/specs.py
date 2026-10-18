"""Family links written as short strings, for table-driven tests on plain data.

"A parent B" means A is B's parent. Modifiers: "parent:step", "parent:adoptive",
"partner:former". Direct "other family" links: "A sibling B", "A cousin B",
"A grandparent B", "A aunt_uncle B".
"""

from relationships.family import Link


def links(*specs: str) -> list[Link]:
    found = []
    for index, spec in enumerate(specs):
        a, kind, b = spec.split()
        type_, _, modifier = kind.partition(":")
        found.append(
            Link(
                id=f"link{index}",
                a=a,
                b=b,
                type=type_,
                parent_type=(modifier or "biological") if type_ == "parent" else "",
                is_former=modifier == "former",
            )
        )
    return found
