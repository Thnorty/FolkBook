# Private calendar feeds (#117)

## Goal

People already look at a calendar every day. A private calendar link puts the birthdays from FolkBook into Google Calendar, Apple Calendar, Outlook or Thunderbird, with no third-party account and no sync to set up. Later, anniversaries (#112) and promises with due dates (#113) can join the same feed.

## Decisions taken while designing

- **Whose birthdays:** everyone you can see by default, including people in spaces shared with you. A link can instead be limited to chosen spaces, the way API keys are.
- **How many links:** several, each with a name, its own spaces, and its own revoke (for example "Family" and "Everyone"). The link is shown once.
- **Events:** dated all-day events for the coming 12 months, worked out on every poll, not one repeating event per person. That keeps the 29 February rule from Today and lets each event say the age it brings ("turns 35").

## Delivery

Two PRs:

1. **Backend:** the `calendars` app (model, link management, the feed), tests, DECISIONS and AGENTS.
2. **Settings screen:** Settings → Calendar, sharing the space picker with the API key dialog, and UI_FLOWS.

## 1. The link

- **Model `calendars.CalendarFeed`** (a `core.models.BaseModel`):
  - `owner` (deleting the account deletes their links);
  - `name` (1–60 characters, required);
  - `hashed` (SHA-256 of the token, unique), `last_five`;
  - `limited` (bool) and `spaces` (many-to-many to Space): not limited means every space the owner can see. As with API keys, a limited link whose spaces were all deleted shows nobody, never everybody;
  - `last_fetched_at` (null until a calendar app first asks);
  - `created_at`.
- **Token:** `fb_cal_` followed by 32 random letters and digits. It's made and hashed with the same helpers as API keys. Those move from `api_keys/services.py` into `core/tokens.py` (`new_token(prefix)`, `hash_token(token)`), and API keys use them from there.
- **Shown once:** the create response carries the feed's full URL (`{FOLKBOOK_URL}/api/calendars/feed/{token}.ics`). Only the hash is stored, and nothing returns the token again.

## 2. Managing links

A router at `/api/calendars`, taking only the login cookie (`auth=django_auth`, like `/api/api-keys`). An API key gets 401 there; `tests/api_keys/test_sign_in.py` lists it with the account-level routers.

- `GET /api/calendars` → your links, newest first, paginated (`{"items", "count"}`): `id`, `name`, `last_five`, `limited`, `spaces` (only those you can still see), `last_fetched_at`, `created_at`.
- `POST /api/calendars` `{name, space_ids?}` → 201 with the same fields plus `url`. `space_ids: null` (or left out) means every space. Each space must be one you can see (`visible_spaces`), or it's 422. An empty or blank name is 422.
- `DELETE /api/calendars/{uuid:feed_id}` → 204. Someone else's link is 404.
- `access/policy.py` gets `visible_calendar_feeds(access)` (your own links, full access only), like `visible_api_keys`.

## 3. The feed

`GET /api/calendars/feed/{token}.ics`, with `auth=None`: calendar apps can't send headers or cookies, so the token in the URL is the secret.

- **Finding the link:** by the token's hash, with an active owner. An unknown token, a revoked link or a disabled owner is 404 `{"detail": "Not Found"}`, so nothing says which links exist.
- **Who's in it:** the feed builds `Access.limited(owner, space_ids=…, include_private=False, read_only=True)` from the link and reads `visible_people(access)` through the policy layer, like every other read. It leaves out the owner's own Me, as Today does.
- **Never in it:** notes, memory aids, the timeline, contact details, tags. Only a name and a date.
- **Plain GET:** it changes no data. It only sets `last_fetched_at`, at most once a minute, so Settings can show "last used".
- **Response:** `200`, `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private, max-age=3600`.

### Events

- One `VEVENT` per birthday from today to 12 months ahead, from `today.birthdays.upcoming_birthdays(people, today, 365)`. The 29 February rule comes from there. "Today" is the owner's own date, in the time zone their browser saved for reminders (`reminders.digest.local_today(settings_for(owner))`), as the email digest does; without one, the server's.
- All-day: `DTSTART;VALUE=DATE:20261020` and `DTEND;VALUE=DATE:20261021`. `TRANSP:TRANSPARENT`, so it doesn't show the user as busy.
- `SUMMARY`: "Selin Party turns 35" when the year is known, otherwise "Selin Party's birthday". A cake emoji leads the title ("🎂 Selin Party turns 35").
- `UID`: `birthday-{person id}-{year}@folkbook`, stable across polls, so calendar apps update an event instead of adding a copy.
- `DTSTAMP`: the time of the request, in UTC.
- The calendar: `VERSION:2.0`, `PRODID:-//FolkBook//Calendar feed//EN`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME:FolkBook · {link name}`, and refresh hints `REFRESH-INTERVAL;VALUE=DURATION:PT6H` and `X-PUBLISHED-TTL:PT6H`.
- **Text rules (RFC 5545):** lines end with CRLF; text escapes `\`, `;`, `,` and newlines; lines longer than 75 octets are folded (CRLF and a space), never in the middle of a UTF-8 character.
- Written by hand in `calendars/ics.py`, with no new dependency: the format needed here is small.

## 4. Settings → Calendar

A new page after Reminders (`/settings/calendar`, `SETTINGS_SECTIONS`), built like Settings → API keys:

- An intro line: "Birthdays in the calendar app you already use. Each link is private: anyone with it can see the names and birthdays in it."
- The list of links: name; "Everyone you can see" or the spaces' names; "Last used 2 hours ago" or "Not used yet"; **Revoke**, which asks first in a `ConfirmDialog` ("Calendars using this link stop updating").
- An empty state: one line and **New calendar link**.
- **New calendar link** opens a `<FormDialog small>`:
  - name (required, 60 characters);
  - who's in it: "Everyone you can see" or "Only some spaces" with the space checkboxes. That picker is the one in `CreateKeyDialog`, moved into a shared `SpacePicker` both dialogs use.
- After **Create**, the dialog shows the link once:
  - the URL with a copy button (`CopyLink`);
  - **Open in your calendar app**: the same URL with `webcal://`, which opens Apple Calendar, Outlook and others directly;
  - a hint: "Google Calendar: Other calendars → From URL, then paste the link.";
  - "You won't see this link again. Make a new one if you lose it."
- Light and dark, phone and desktop, as every screen.

## 5. Privacy and safety

- Another user's link never shows your people unless they can see them; the feed's access is exactly the owner's, narrowed.
- A link limited to spaces shows only people in those spaces (and private links' people never, since none are in a space).
- Someone the owner can no longer see (space left or unshared, person torn out or hidden) drops out at the next poll.
- **Logs:** the token is in the URL, so a reverse proxy may write it to its access log, as with every calendar feed. Only its hash is stored and it can be revoked; DECISIONS says so. FolkBook itself never logs it.

## 6. Tests

**Backend (pytest):**
- Tokens: the format; only the hash is stored; `core/tokens.py` is what API keys use too.
- Management: create returns the URL once; the list never has a token or URL; a blank name or a space you can't see is 422; revoke is 204 and someone else's link is 404; an API key gets 401 on every `/api/calendars` route (`test_sign_in.py`).
- Feed: the right people and titles for 12 months; the age; "'s birthday" without a year; 29 February on the 28th in a common year; stable UIDs; all-day dates; `text/calendar`; CRLF line ends, folding at 75 octets without splitting a character, escaping of `,` `;` `\`; `last_fetched_at` set.
- Privacy: another user's people never appear; a limited link shows only its spaces; a person you can't see any more drops out; a disabled owner, a revoked link and an unknown token are 404; no note, memory aid, contact detail or tag text ever appears in the feed.
- Routing: `token` is already allowed as a non-id path parameter.

**Frontend (Vitest):** create a link, see the URL once with copy and `webcal://`, then the list shows it without the URL; limit to spaces; revoke asks first and removes it.

No e2e test: this isn't one of the key flows.

## Out of scope

- Anniversaries, memorial days and promises: they join the feed when #112 and #113 add them.
- Alarms inside events (`VALARM`): calendar apps mostly ignore them in subscribed calendars; people set their own alerts.
- A server-wide switch to turn feeds off.
