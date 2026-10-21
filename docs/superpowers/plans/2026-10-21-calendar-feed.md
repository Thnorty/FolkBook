# Private Calendar Feeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Private, named calendar links (`.ics` feeds) with everyone's birthdays, or only chosen spaces', for the coming 12 months, managed in Settings → Calendar.

**Architecture:** A new Django app `calendars` holds the link model, the account-level management router (`/api/calendars`, login cookie only) and a public feed route (`/api/calendars/feed/{token}.ics`, `auth=None`) that reads people through `access/policy.py` with a narrowed `Access`. A small hand-written `ics.py` turns birthdays from `today.birthdays` into RFC 5545 text. The frontend adds a Settings page built like Settings → API keys, sharing its space picker.

**Tech Stack:** Django + Django Ninja, pytest; React + TanStack Query, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-calendar-feed-design.md`

## Global Constraints

- Token: `fb_cal_` + 32 random letters and digits; only its SHA-256 hash is stored; shown once (in the create response's `url`).
- Feed URL: `{settings.FOLKBOOK_URL}/api/calendars/feed/{token}.ics`.
- `/api/calendars` takes only the login cookie (`auth=django_auth`); the feed route is `auth=None`.
- The feed reads only through `visible_people(Access.limited(owner, space_ids=…, include_private=False, read_only=True))`, without the owner's Me. Never notes, memory aids, timeline, contact details or tags.
- Unknown token, revoked link, disabled owner: 404 `{"detail": "Not Found"}`.
- Events: birthdays from the owner's today (`local_today(settings_for(owner))`) to 365 days ahead; `SUMMARY` "🎂 {name} turns {n}" or "🎂 {name}'s birthday"; `UID` `birthday-{person id}-{year}@folkbook`; all-day; `TRANSP:TRANSPARENT`.
- `.ics` text: CRLF line ends, fold at 75 octets without splitting a UTF-8 character, escape `\` `;` `,` and newlines.
- Response: `text/calendar; charset=utf-8`, `Cache-Control: private, max-age=3600`. `last_fetched_at` written at most once a minute.
- No new dependency. Conventional Commits, no AI attribution. Two PRs: backend (Tasks 1–4), settings screen (Tasks 5–6).

## Review Focus

- A person whose name has a comma, semicolon, backslash or line break: the `.ics` must stay valid (escaped). → Task 3 test.
- A long name with non-ASCII letters (Şükrü Öztürk…) pushing a line past 75 octets: folded without breaking a character. → Task 3 test.
- A limited link whose spaces were all deleted: shows nobody, never everybody. → Task 4 test.
- A calendar app polling every few minutes: `last_fetched_at` is written at most once a minute, not on every poll. → Task 4 test.
- Owner with a saved time zone ahead of the server, just after their midnight: "today" is theirs, so a birthday that has just begun for them is in the feed. → Task 4 test.

---

## PR 1: Backend (branch `feat/calendar-feed`)

### Task 1: Shared token helpers

**Files:**
- Create: `backend/core/tokens.py`
- Modify: `backend/api_keys/services.py` (`new_key`, `hash_key` and their callers: `api_keys/auth.py`, tests)
- Test: `backend/tests/test_tokens.py`

**Interfaces:**
- Produces: `new_token(prefix: str) -> str` (prefix + 32 of `string.ascii_letters + string.digits` via `secrets.choice`); `hash_token(token: str) -> str` (SHA-256 hex).

- [ ] **Step 1: Write the failing test** `test_a_token_is_its_prefix_and_32_letters_or_digits` (`re.fullmatch(r"fb_cal_[A-Za-z0-9]{32}", new_token("fb_cal_"))`, two calls differ) and `test_a_token_is_stored_as_its_sha256` (`hash_token("abc") == hashlib.sha256(b"abc").hexdigest()`).
- [ ] **Step 2: Run** `cd backend && uv run --env-file ../.env pytest tests/test_tokens.py` → FAIL (no module `core.tokens`).
- [ ] **Step 3: Implement** `core/tokens.py`; in `api_keys/services.py` replace `new_key()` with `new_token(PREFIX)` and `hash_key` with `hash_token` everywhere (`grep -rn "hash_key\|new_key" backend`), keeping the "fast hash is enough" comment with `hash_token`.
- [ ] **Step 4: Run** `pytest tests/test_tokens.py tests/api_keys` → PASS.
- [ ] **Step 5: Commit** `refactor(api): share token helpers for keys and links`.

### Task 2: Calendar links and managing them

**Files:**
- Create: `backend/calendars/{__init__,apps,models,schemas,services,api}.py`, `backend/calendars/migrations/0001_initial.py` (via `makemigrations calendars`)
- Modify: `backend/config/settings.py` (`INSTALLED_APPS`), `backend/config/api.py` (`api.add_router("/calendars", calendars_router, auth=django_auth)`), `backend/access/policy.py` (`visible_calendar_feeds`), `backend/tests/api_keys/test_sign_in.py` (`"/api/calendars"` in `COOKIE_ONLY`)
- Test: `backend/tests/calendars/__init__.py`, `backend/tests/calendars/test_manage.py`

**Interfaces:**
- Consumes: `new_token`, `hash_token` (Task 1).
- Produces:
  - `calendars.models.CalendarFeed(BaseModel)`: `owner` FK (CASCADE, `related_name="calendar_feeds"`), `name` CharField(60), `hashed` CharField(64, unique), `last_five` CharField(5), `limited` bool, `spaces` M2M Space (`blank=True, related_name="+"`), `last_fetched_at` DateTimeField(null).
  - `access.policy.visible_calendar_feeds(access: Access) -> QuerySet[CalendarFeed]`: the user's own; none for a limited access (like `visible_api_keys`).
  - `calendars.services.PREFIX = "fb_cal_"`; `create_feed(access: Access, data: CalendarFeedIn) -> tuple[CalendarFeed, str]` (returns the token); `revoke_feed(feed: CalendarFeed) -> None`; `feed_url(token: str) -> str`.
  - Schemas: `CalendarFeedIn {name: str (1–60), space_ids: list[UUID] | None = None}`; `CalendarFeedOut {id, name, last_five, limited, spaces: list[SpaceRef], last_fetched_at, created_at}`; `CreatedCalendarFeedOut(CalendarFeedOut) {url: str}`.
  - Routes: `GET ""` (paginated, newest first, spaces prefetched through `visible_spaces`), `POST ""` → 201, `DELETE "/{uuid:feed_id}"` → 204.

- [ ] **Step 1: Write the failing tests** in `test_manage.py` (use `api`, `world`):
  - `test_creating_a_link_shows_its_url_once`: POST `{"name": "Family"}` → 201; `url` matches `rf"{FOLKBOOK_URL}/api/calendars/feed/fb_cal_[A-Za-z0-9]{{32}}\.ics"`; the stored `hashed == hash_token(token)` and `last_five == token[-5:]`; GET list has the link without `url` or any token text.
  - `test_a_link_can_be_limited_to_spaces`: POST with `space_ids=[climbing]` → `limited` true, `spaces` names `["Climbing club"]`.
  - `test_a_blank_name_or_a_space_you_cant_see_is_422`: `{"name": "  "}` → 422; Sofia with `space_ids=[climbing]` → 422.
  - `test_revoking_deletes_the_link_and_only_yours`: DELETE own → 204 and gone; Deniz deleting Ela's → 404.
  - `test_links_take_only_the_login_cookie`: `api.with_key(key)` GET `/calendars` → 401.
- [ ] **Step 2: Run** `pytest tests/calendars tests/api_keys/test_sign_in.py` → FAIL (no app / route unclassified).
- [ ] **Step 3: Implement** the app as in Interfaces; validate spaces the way `api_keys.services._spaces` does (reuse it if it can move to a shared place without widening it, otherwise call `visible_spaces` the same way). Blank name → `ValidationError({"name": "Give the link a name."})`. Run `makemigrations calendars`.
- [ ] **Step 4: Run** `pytest tests/calendars tests/api_keys tests/test_routing.py` → PASS; `uv run ruff check . && uv run ruff format --check .` clean.
- [ ] **Step 5: Commit** `feat(api): calendar links you can create and revoke`.

### Task 3: Writing `.ics`

**Files:**
- Create: `backend/calendars/ics.py`
- Test: `backend/tests/calendars/test_ics.py`

**Interfaces:**
- Produces: `calendar(name: str, events: list[Event], now: datetime.datetime) -> str`; `Event` dataclass `(uid: str, day: datetime.date, summary: str)`; helpers `escape(text: str) -> str`, `fold(line: str) -> str`.

- [ ] **Step 1: Write the failing tests:**
  - `test_text_is_escaped`: `escape('A, B; C\\ D\nE') == 'A\\, B\\; C\\\\ D\\nE'`.
  - `test_long_lines_fold_at_75_octets_without_splitting_a_letter`: fold a `SUMMARY:` line of 40 × "Ş"; every physical line ≤ 75 octets when UTF-8 encoded, continuation lines start with one space, and unfolding (remove `"\r\n "`) gives back the line.
  - `test_an_event_is_all_day_and_transparent`: one `Event("birthday-x-2026@folkbook", date(2026,10,20), "🎂 Selin turns 35")` → output contains `DTSTART;VALUE=DATE:20261020`, `DTEND;VALUE=DATE:20261021`, `TRANSP:TRANSPARENT`, `UID:birthday-x-2026@folkbook`, `DTSTAMP:20261021T090000Z` for `now=2026-10-21 09:00 UTC`.
  - `test_the_calendar_has_its_name_and_refresh_hints_and_crlf`: starts `BEGIN:VCALENDAR\r\n`, has `VERSION:2.0`, `PRODID:-//FolkBook//Calendar feed//EN`, `METHOD:PUBLISH`, `X-WR-CALNAME:FolkBook · Family`, `REFRESH-INTERVAL;VALUE=DURATION:PT6H`, `X-PUBLISHED-TTL:PT6H`, ends `END:VCALENDAR\r\n`, and no bare `\n` without `\r`.
- [ ] **Step 2: Run** `pytest tests/calendars/test_ics.py` → FAIL.
- [ ] **Step 3: Implement** `ics.py`. Folding: split on UTF-8 octets, backing off to a character boundary (never cut inside a multi-byte sequence); first line ≤ 75 octets, continuation lines are a space + ≤ 74 octets.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(api): write birthdays as iCalendar text`.

### Task 4: The feed, privacy, docs and API types

**Files:**
- Create: `backend/calendars/feed.py`
- Modify: `backend/calendars/api.py` (feed route), `docs/DECISIONS.md`, `AGENTS.md` (account-level router list), `frontend/src/api/schema.d.ts` (`npm run api:generate`)
- Test: `backend/tests/calendars/test_feed.py`

**Interfaces:**
- Consumes: `CalendarFeed`, `hash_token`, `ics.calendar`, `today.birthdays.upcoming_birthdays`, `reminders.digest.local_today`, `reminders.nudges.settings_for`, `access.policy.Access`, `visible_people`.
- Produces: `feed.find_feed(token: str) -> CalendarFeed | None` (by hash, `owner__is_active=True`); `feed.feed_text(feed: CalendarFeed, now: datetime.datetime) -> str`; route `GET /feed/{token}.ics` with `auth=None` → `HttpResponse(text, content_type="text/calendar; charset=utf-8")` plus `Cache-Control: private, max-age=3600`, or 404 via `core.api.not_found`-shaped body.
- `last_fetched_at` is updated only when null or older than 1 minute, with a single `UPDATE … WHERE` (no read-modify-write).

- [ ] **Step 1: Write the failing tests** (`world`, a plain `Client`; set birthdays with `birth_day`/`birth_month`/`birth_year` on world people; freeze "today" by saving a `ReminderSettings(time_zone=…)` and patching `timezone.now`):
  - `test_the_feed_lists_birthdays_for_the_next_12_months`: Oskar 20 Oct 1991, Ines 3 Jan (no year), Emma birthday yesterday → text has "🎂 Oskar turns 35" on 20261020, "🎂 Ines's birthday" on 20270103, Emma next year only; `content-type` starts `text/calendar`; `cache-control` is `private, max-age=3600`.
  - `test_29_february_falls_on_the_28th_in_a_common_year`: birthday 29 Feb, today 2026-10-21 → `DTSTART;VALUE=DATE:20270228`.
  - `test_uids_are_stable_between_polls`: two GETs → same `UID:` lines.
  - `test_today_is_the_owners_own_date`: owner `time_zone="Pacific/Kiritimati"`, server time 2026-10-19 23:30 UTC (already 20 Oct there), Oskar born 20 Oct → included as 20261020.
  - `test_another_users_people_never_appear`: Ela's everyone-link shows Oskar, Ines, Emma, Tom, Ola (Hackathon is shared with her) and never Jin, Yuki or "Ela".
  - `test_a_limited_link_shows_only_its_spaces`: Ela's Climbing-only link → Oskar, Ines; not Emma, Tom.
  - `test_a_link_whose_spaces_are_gone_shows_nobody`: delete Climbing via `space_services.delete_space` → no `BEGIN:VEVENT`.
  - `test_someone_you_cant_see_any_more_drops_out`: remove Ela from Hackathon → Tom gone from her feed.
  - `test_private_details_never_appear`: world note/memory aid/contact text and tags never in the text.
  - `test_unknown_revoked_or_disabled_is_404`: wrong token, revoked link, `owner.is_active=False` → 404 `{"detail": "Not Found"}`.
  - `test_polling_records_last_use_at_most_once_a_minute`: GET sets `last_fetched_at`; a second GET 30 s later leaves it; 61 s later moves it.
- [ ] **Step 2: Run** `pytest tests/calendars/test_feed.py` → FAIL.
- [ ] **Step 3: Implement** `feed.py` and the route as in Interfaces (space ids `frozenset(feed.spaces.values_list("pk", flat=True))` when `limited`, else `None`; exclude `is_me` people as Today's birthdays endpoint does).
- [ ] **Step 4: Run** the whole backend suite `uv run --env-file ../.env pytest` and `ruff` → PASS / clean.
- [ ] **Step 5: Docs and types:** DECISIONS: a "Calendar feeds" entry (what's in it, token rules, 404s, the proxy-log caveat); AGENTS: add `/calendars` to the account-level router list. Run `cd frontend && npm run api:generate && npm run typecheck`.
- [ ] **Step 6: Commit** `feat(api): private calendar feeds of birthdays`, footer `Refs #117`. Push, open PR 1.

## PR 2: Settings screen (branch `feat/calendar-settings`, from main after PR 1)

### Task 5: Shared space picker

**Files:**
- Create: `frontend/src/features/spaces/SpacePicker.tsx`
- Modify: `frontend/src/features/apiKeys/CreateKeyDialog.tsx`
- Test: existing `frontend/src/features/apiKeys/ApiKeys.test.tsx` (unchanged, must stay green)

**Interfaces:**
- Produces: `SpacePicker({ legend: string, allLabel: string, value: string[], onChange: (ids: string[]) => void })`: the checkboxes from `CreateKeyDialog` (one per space from `spacesQuery`, then the "all" choice, ticked when `value` is empty).

- [ ] **Step 1: Run** `npx vitest run src/features/apiKeys` → PASS (baseline).
- [ ] **Step 2: Move** the "Limited to spaces" fieldset into `SpacePicker`; `CreateKeyDialog` renders `<SpacePicker legend="Limited to spaces" allLabel="All spaces" value={spaceIds} onChange={setSpaceIds} />`.
- [ ] **Step 3: Run** `npx vitest run src/features/apiKeys && npm run typecheck && npm run lint` → PASS / clean.
- [ ] **Step 4: Commit** `refactor(ui): share the space picker`.

### Task 6: Settings → Calendar

**Files:**
- Create: `frontend/src/features/calendars/{queries.ts,CalendarSettings.tsx,CreateCalendarDialog.tsx,Calendars.test.tsx}`
- Modify: `frontend/src/features/settings/sections.ts` (`{ to: '/settings/calendar', label: 'Calendar', admin: false }` after Reminders), `frontend/src/router.tsx` (route `calendar`), `docs/UI_FLOWS.md` (§3.15 Settings)

**Interfaces:**
- Consumes: `SpacePicker` (Task 5); generated `components['schemas']['CalendarFeedOut' | 'CreatedCalendarFeedOut' | 'CalendarFeedIn']`; `CopyLink`, `FormDialog small`, `SettingsPage`, `useClosing`, `formatRelativeMoment`.
- Produces: `calendarFeedsQuery` (key `['calendars']`), `createCalendarFeed(queryClient, body)`, `revokeCalendarFeed(queryClient, id)`, mirroring `apiKeys/queries.ts`.

- [ ] **Step 1: Write the failing tests** (`fakeServer`, `renderApp('/settings/calendar')`):
  - `it('says what calendar links are for when there are none')`: the intro "Birthdays in the calendar app you already use." and a **New calendar link** button.
  - `it('creates a link and shows it once, with copy and webcal')`: fill name "Family", Create → POST body `{name: 'Family', space_ids: null}`; the dialog shows the URL, a link named "Open in your calendar app" with `href` `webcal://…/api/calendars/feed/fb_cal_….ics`, "Google Calendar: Other calendars → From URL, then paste the link." and "You won't see this link again."; after closing, the list shows "Family" and "Everyone you can see" and no URL anywhere.
  - `it('limits a link to chosen spaces')`: tick "Climbing club" → `space_ids: ['s1']`; list shows "Climbing club".
  - `it('shows when a calendar last asked')`: `last_fetched_at` → "Last used …"; null → "Not used yet".
  - `it('revokes a link after asking in place')`: Revoke → "Calendars using this link stop updating." → confirm → DELETE sent, row gone.
  - `it('shows the section after Reminders')`.
- [ ] **Step 2: Run** `npx vitest run src/features/calendars` → FAIL.
- [ ] **Step 3: Implement** the page and dialog as in the spec §4, following `ApiKeysSettings` / `CreateKeyDialog` structure (opening `key` so a shown link never reappears; revoke in place; focus handling like API keys). `webcal://` = the URL with its `http(s)://` replaced.
- [ ] **Step 4: Run** `npm test -- --run && npm run typecheck && npm run lint && npm run format:check` → PASS / clean. Check in Chrome against the e2e stack: create, copy, fetch the `.ics` URL (it downloads a valid calendar with the test birthdays), revoke; phone and desktop, light and dark.
- [ ] **Step 5: UI_FLOWS** §3.15: Settings → Calendar. **Commit** `feat(ui): calendar links in Settings`, footer `Closes #117`. Push, open PR 2.
