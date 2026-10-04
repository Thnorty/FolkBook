"""vCard 3.0 (RFC 2426), the version phones and contact apps import most reliably."""

from people.models import ContactMethod, Person

# Contact labels people type, as the vCard types phones understand.
PHONE_TYPES = {"mobile": "CELL", "cell": "CELL", "home": "HOME", "work": "WORK", "fax": "FAX"}
EMAIL_TYPES = {"home": "HOME", "work": "WORK"}
# A year Apple's contacts use for "no year", flagged by X-APPLE-OMIT-YEAR.
NO_YEAR = 1604


def escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("\n", "\\n").replace(",", "\\,").replace(";", "\\;")


def fold(line: str) -> str:
    """Lines longer than 75 bytes continue on the next line after a space (RFC 2425),
    never splitting a character."""
    parts: list[str] = []
    current, size = "", 0
    for char in line:
        width = len(char.encode())
        if size + width > (75 if not parts else 74):
            parts.append(current)
            current, size = "", 0
        current += char
        size += width
    parts.append(current)
    return "\r\n ".join(parts)


def name_parts(name: str) -> tuple[str, str]:
    """(family, given): the last word is taken as the family name ("Emma Yılmaz")."""
    words = name.split()
    return (words[-1], " ".join(words[:-1])) if len(words) > 1 else ("", name.strip())


def card(person: Person, contacts: list[ContactMethod]) -> str:
    family, given = name_parts(person.name)
    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"FN:{escape(person.name)}",
        f"N:{escape(family)};{escape(given)};;;",
    ]
    for contact in contacts:
        types = PHONE_TYPES if contact.kind == ContactMethod.ContactKind.PHONE else EMAIL_TYPES
        kind = types.get(contact.label.strip().casefold())
        if contact.kind == ContactMethod.ContactKind.PHONE:
            lines.append(f"TEL{f';TYPE={kind}' if kind else ''}:{escape(contact.value)}")
        elif contact.kind == ContactMethod.ContactKind.EMAIL:
            lines.append(f"EMAIL;TYPE=INTERNET{f',{kind}' if kind else ''}:{escape(contact.value)}")
    if person.birth_day and person.birth_month:
        date = f"{person.birth_month:02}-{person.birth_day:02}"
        lines.append(
            f"BDAY:{person.birth_year:04}-{date}"
            if person.birth_year
            else f"BDAY;X-APPLE-OMIT-YEAR={NO_YEAR}:{NO_YEAR}-{date}"
        )
    lines.append("END:VCARD")
    return "".join(f"{fold(line)}\r\n" for line in lines)
