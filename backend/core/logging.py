"""Keeping secrets that travel in URLs out of the server's log."""

import logging
import re

# A calendar feed's link is its own key (calendar apps can't sign in), so its path must
# never reach the log: a token logged while its owner was disabled works again later.
FEED_TOKEN = re.compile(r"(/api/calendars/feed/)[^/\s]+")


class RedactFeedTokens(logging.Filter):
    """Writes `/api/calendars/feed/<token>` instead of the token in any log line about one."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if "/api/calendars/feed/" in message:
            record.msg = FEED_TOKEN.sub(r"\1<token>", message)
            record.args = None
        return True
