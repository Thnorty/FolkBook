"""Turning a browser's user agent into "Firefox on macOS" for the devices list."""

import re

# Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
_BROWSERS = [
    ("Edge", r"Edg/"),
    ("Opera", r"OPR/"),
    ("Firefox", r"Firefox/"),
    ("Chrome", r"Chrome/|CriOS/"),
    ("Safari", r"Safari/"),
]
_SYSTEMS = [
    ("iPhone", r"iPhone"),
    ("iPad", r"iPad"),
    ("Android", r"Android"),
    ("Windows", r"Windows"),
    ("macOS", r"Mac OS X|Macintosh"),
    ("Linux", r"Linux"),
]


def describe_device(user_agent: str) -> str:
    browser = _first_match(_BROWSERS, user_agent)
    system = _first_match(_SYSTEMS, user_agent)
    if browser and system:
        return f"{browser} on {system}"
    return browser or system or "Unknown device"


def _first_match(patterns: list[tuple[str, str]], text: str) -> str | None:
    return next((name for name, pattern in patterns if re.search(pattern, text)), None)
