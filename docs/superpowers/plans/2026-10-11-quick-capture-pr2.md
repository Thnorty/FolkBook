# Quick capture (PR 2 of 2 for #32) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write what happened. The AI suggests people, matches, field changes, connections, memory aids and timeline entries; you review and edit every one, save them all at once, and can undo it all from the summary.

**Architecture:**
- **Backend:** a new `capture` app.
  - `prompt.py` asks the AI (PR 1's `ai.client.chat`) for JSON in a fixed shape.
  - `draft.py` turns that answer into a draft: it drops anything inconsistent and matches names to the people you can see (the AI never sees your book).
  - `save.py` writes the reviewed items through the existing services in one transaction, recording a `Capture` row for undo.
- **Frontend:** `/capture` is one page moving through write → reading → review → saved. The review's state lives in a plain-data module (`review.ts`) that's tested directly.

**Tech Stack:** Django + Ninja, PR 1's `ai` app; React + TanStack Query/Router, Vitest; Playwright with a fake OpenAI-compatible server.

**Spec:** `docs/superpowers/specs/2026-10-11-quick-capture-design.md` §"Decisions", §2, §3, "Words" and "Tests". Design screens 2d–2j in `design/FolkBook.dc.html`.

## Global Constraints

- **Only the text and today's date go to the AI.** No names from the book, no ids.
- **Nothing is stored at Suggest.** At Save, the `Capture` row holds ids and old values, never the text.
- **AI errors answer 424 `{detail}`,** in the spec's words, by kind:
  - `refused` → "Your key was refused. Check Settings → AI.";
  - `timeout` → "The AI didn't answer in time (90 s).";
  - `bad_answer` → "The AI's answer didn't make sense. Try again.";
  - `unreachable` → "Can't reach the AI at {address}" plus the localhost hint (PR 1's message with "the AI at" added);
  - anything else → the client's message.

  No AI answers 409 "AI is off: add a key in Settings → AI.". (A 5xx would show only the app's generic message, so these stay 4xx.)
- **`/api/capture` takes the login cookie only,** like `/api/ai`. Add it to `COOKIE_ONLY` in `tests/api_keys/test_sign_in.py`.
- **Limits:** text is 1–4,000 characters; a suggestion waits up to 90 s, with one automatic retry on `bad_answer`.
- **Field changes on existing people:** `how_we_met`, `work`, `birthday`, and adding `tags` (owner only, as in `OWNER_ONLY_FIELDS`). Never an existing person's spaces.
- **Permissions:** everything goes through `access/policy.py` and the existing services: `create_person`, `update_person`, `create_relationship`, `create_memory_aid`, `log_interaction`.
- **Defaults:**
  - parent links get `parent_type="biological"` (editable on the card);
  - entry dates after `today` become `today`;
  - a connection's space defaults to the chosen space when both people are in it (new people are in it), otherwise none.
- **Copy, verbatim:**
  - "Here's what I read", "Who is “{name}”?", "Someone else: create a new “{name}”";
  - "Memory aids stay private, even in shared spaces.";
  - "Saved as other family · {type} — nobody's parents needed. Add their parents later and FolkBook works the same link out by itself." (for sibling, cousin, grandparent, aunt / uncle);
  - "+ Add something the AI missed", "{n} of {m} selected", "Discard", "Save {n} items", "Edit text";
  - "Reading it back…", "Local models can take a minute.";
  - "Added {list}." with `words()` from `lib/names`, e.g. "Added 1 person, 1 connection and 1 memory aid.", and "{First name} matched to someone you already had.";
  - "Open {first name}'s page", "Capture something else", "Undo all of this";
  - "Write like you'd tell a friend. Nothing is saved until you review it.", "Use the form instead", "Put everyone in a space";
  - the AI-off text of spec §3 (2j);
  - the phrasing chips "Coffee with …", "… is …'s sister", "Met … at …".
- **Undo:** owner only, once (409 after that); a daily job deletes `Capture` rows older than a day.

## Review Focus

1. **An AI answer that's inconsistent:**
   - a connection or memory aid naming an unknown ref, a person without a name, or a type outside the list: dropped quietly;
   - an answer that isn't JSON: one retry, then "The AI's answer didn't make sense. Try again.";
   - no 500 in any case.

   Test in Task 1.
2. **A name that belongs to someone you can't see** (another user's private person): never a candidate, and never mentioned. Test in Task 2.
3. **A crafted save** changing a person you can't edit, or linking someone you can't see: 403, and nothing at all is saved (one transaction). Test in Task 3.
4. **Unticking a new person** unticks every connection, memory aid, entry and change about them, and they leave the count. Re-ticking brings back only the person. Test in Task 4.
5. **Undo after something changed again:** a field edited since keeps its new value; a second undo → 409; someone else's capture → 404. Test in Task 3.

---

### Task 1: Asking the AI (`capture/prompt.py`)

**Files:**
- Create: `backend/capture/__init__.py`, `apps.py`, `prompt.py`
- Modify: `backend/config/settings.py` (`INSTALLED_APPS += "capture"`)
- Test: `backend/tests/capture/__init__.py`, `backend/tests/capture/test_prompt.py`

**Interfaces:**
- Consumes: PR 1's `ai.client.chat(target, messages, schema=…, timeout=90)`, `Target`, `AiError`.
- Produces:
  - `CAPTURE_SCHEMA: dict`: a JSON schema in OpenAI strict form (every property required, `additionalProperties: false`, nullable with `["string", "null"]`):
    - `people: [{ ref: str, name: str, how_we_met: str|null, work: str|null, birthday: str|null ("YYYY-MM-DD" or "--MM-DD"), tags: [str] }]`;
    - `connections: [{ a: str, b: str, type: enum(parent, partner, sibling, cousin, grandparent, aunt_uncle, friend, colleague, classmate, met_at, custom), label: str|null }]`, where `a` and `b` are a ref or `"me"`, and `parent` means "a is a parent of b";
    - `memory_aids: [{ about: str, text: str }]`;
    - `entries: [{ about: str, kind: enum(met, call, message, event, other), date: "YYYY-MM-DD", note: str }]`.
  - `@dataclass AiDraft` with those four lists, already cleaned:
    - refs unique;
    - names stripped and non-empty;
    - every `a`, `b` and `about` a known ref (or `"me"` for connections);
    - no connection from a person to themselves;
    - types and kinds inside their lists;
    - dates parsed, with any date after `today` set to `today`;
    - birthdays as `{day, month, year | None}` or `None`.
  - `read_capture(target: Target, text: str, today: date) -> AiDraft`:
    - sends a system prompt (in the module, worded to extract only what the text says, with "me" being the writer) and a user message (`Today is {today:%Y-%m-%d}.\n\n{text}`), with `CAPTURE_SCHEMA`;
    - parses the reply with `json.loads` and cleans it;
    - on a parse error or a top-level shape error, retries once, then raises `AiError("bad_answer", "The AI's answer didn't make sense. Try again.")`.

- [ ] **Step 1: Write the failing tests** (`stub_ai` from PR 1, with `chat_reply(json.dumps(...))`):
  - `test_only_the_text_and_today_go_to_the_ai`: the request's messages contain the text and "2026-10-11", and no other user content; `response_format.json_schema.schema == CAPTURE_SCHEMA`.
  - `test_reads_people_connections_aids_and_entries`: a canned answer for "Met Tom at the hackathon, he's Emma's cousin, likes climbing, coffee yesterday" gives two people (Tom with work "Spotify", Emma), the connection `t`–`e` `cousin`, the memory aid on `t`, and the entry on `t` dated 2026-10-10.
  - `test_inconsistent_parts_are_dropped` (Review Focus 1): a connection to `"x9"`, a memory aid about `"nobody"`, a person with name `"  "`, the type `"boss"`, a connection from `t` to `t`, and a duplicate ref → all dropped. The rest is kept.
  - `test_future_dates_become_today`: entry date `2026-12-01` → `2026-10-11`.
  - `test_birthdays_with_or_without_a_year`: `"1990-04-03"` → `{day: 3, month: 4, year: 1990}`; `"--04-03"` → `year: None`; `"soon"` → `None`.
  - `test_nonsense_is_asked_again_then_refused`: `"not json"` then a valid answer → the valid one, after two requests. Twice `"not json"` → `AiError` with kind `bad_answer` and its message.
- [ ] **Step 2: Run** `cd backend && uv run --env-file ../.env pytest tests/capture -q`
Expected: FAIL (the module is missing).
- [ ] **Step 3: Implement** the Interfaces above. Cleaning is plain Python over the parsed dict; there's no pydantic model for the AI's answer.
- [ ] **Step 4: Run** `uv run --env-file ../.env pytest tests/capture tests/ai -q && uv run ruff check . && uv run ruff format --check .`
Expected: PASS.
- [ ] **Step 5: Commit** `feat(capture): ask the AI what a capture mentions`.

---

### Task 2: The draft and `POST /api/capture/suggest`

**Files:**
- Create: `backend/capture/draft.py`, `backend/capture/schemas.py`, `backend/capture/api.py`
- Modify: `backend/config/api.py` (`api.add_router("/capture", capture_router, auth=django_auth)`), `backend/tests/api_keys/test_sign_in.py` (`COOKIE_ONLY += "/api/capture"`)
- Test: `backend/tests/capture/test_suggest.py`
- Regenerate: the API types

**Interfaces:**
- Consumes:
  - Task 1's `read_capture` and `AiDraft`;
  - PR 1's `ai.services.provider_for(user)` and `Target.of(row)`;
  - `imports.matching.fold`;
  - `access.policy.visible_people`, `can_edit_person`, `visible_spaces`.
- Produces:
  - **The request:** `SuggestIn { text: str (1–4000 after strip), today: date, space_id: UUID | None = None }`. The space must be one you can add people to, otherwise 422.
  - **`DraftOut`:**
    - `people: [DraftPersonOut]`, each `{ ref, name, how_we_met, work, birthday: BirthdayOut | None, tags: list[str], match: "new" | "match" | "choose", candidates: [CandidateOut] }`;
    - for `match`, exactly one candidate; for `choose`, up to 3, the best first; for `new`, none;
    - `connections: [{ id, a, b, type, label, parent_type, space_id }]`;
    - `memory_aids: [{ id, about, text }]`;
    - `entries: [{ id, about, kind, date, note }]`.
  - **`CandidateOut`:**
    - `id`, `name`;
    - `detail`: how we met, else work, else the visible spaces' names joined by " · ", else "";
    - `current`: `{ how_we_met, work, birthday, tags }`;
    - `can_edit`: `can_edit_person`, for how_we_met, work and birthday;
    - `can_tag`: owner only;
    - `in_space`: in the chosen space or not.
  - **`build_draft(access, ai: AiDraft, space: Space | None) -> dict`:**
    - matching: a folded full-name equal to someone visible → `match`, preferring your own person on a tie;
    - otherwise someone whose folded first name equals the mention's folded first word → `choose`, own people first, then by name, at most 3;
    - otherwise `new`;
    - draft ids are `c1…`, `m1…`, `e1…`;
    - a connection's `space_id` is the chosen space when both sides are in it, a new person counting as in it;
    - `parent_type` is `"biological"` for parent links, `""` otherwise.
  - **`POST /api/capture/suggest` → `DraftOut`:**
    - 409 "AI is off: add a key in Settings → AI." when `provider_for` is `None`;
    - 424 `{detail: AiError.message}` on an `AiError` (`timeout`'s message is "The AI didn't answer in time (90 s).");
    - a key that can't be read → 424 "Your key can't be read anymore. Enter it again in Settings → AI.".

- [ ] **Step 1: Write the failing tests** (`world`, `stub_ai`). Point the user's AI at the stub with an `AiProvider` row (`provider="openai_compatible"`, `base_url=stub_ai.url`).
  - `test_matches_names_to_your_people`: Ela captures; the AI names "Emma" (Ela has Emma) and "Tom" (unknown to Ela) → Emma is `choose`, with Emma first; Tom is `new`. A full name equal to one of Ela's people gives `match`.
  - `test_never_matches_someone_you_cannot_see` (Review Focus 2): Jin is Defne's private person. Ela's capture mentions "Jin" → `new`, with no candidates; the response content doesn't contain Jin's id.
  - `test_candidates_say_what_you_may_change`: a shared person in a space where Ela is a viewer → `can_edit: False, can_tag: False`. Her own person → both `True`. `current` holds their present fields.
  - `test_connection_space_follows_the_chosen_space`: with `space_id = climbing` and a connection between new Tom and Oskar (in Climbing) → `space_id` is Climbing; with Emma (not in it) → `None`.
  - `test_no_ai_is_409`; `test_ai_errors_are_424` (a stub 401 → 424 "Your key was refused. Check Settings → AI."; a closed port → "Can't reach the AI at …"); and `test_text_must_fit` (`""` and 4,001 characters → 422).
  - `test_capture_takes_the_login_cookie_only`: an API key gives 401.
  - In the existing route guard, `/api/capture` is on the cookie-only side.
- [ ] **Step 2: Run** `uv run --env-file ../.env pytest tests/capture -q`
Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Load visible people once (`visible_people(access)` with `select_related("owner")`, plus the visible spaces prefetched as in `imports.matching`) and match in Python.
- [ ] **Step 4: Run** the whole backend suite, ruff, and `npm run api:generate && npm run typecheck`.
Expected: PASS.
- [ ] **Step 5: Commit** `feat(capture): suggest a draft, matched to your people`.

---

### Task 3: Save and undo

**Files:**
- Create: `backend/capture/models.py` (+ migration `0001`), `backend/capture/save.py`, `backend/capture/tasks.py`
- Modify: `backend/capture/schemas.py`, `backend/capture/api.py`, `backend/jobs/scheduler.py` (`PERIODIC_JOBS += Periodic(capture_tasks.forget_old_captures, every=1 day)`)
- Test: `backend/tests/capture/test_save.py`, `backend/tests/capture/test_undo.py`
- Regenerate: the API types

**Interfaces:**
- Produces:
  - **The model `Capture(BaseModel)`:**
    - `owner` (FK User, CASCADE);
    - `people`, `relationships`, `memory_aids`, `interactions`: `JSONField(default=list)`, holding the created ids as strings;
    - `changes`: `JSONField(default=list)`, each `{ person, field, before, after }`;
    - `undone_at` (nullable).
  - **`SaveIn`:**
    - `space_id: UUID | None`;
    - `new_people: [{ ref, name, how_we_met = "", work = "", birthday: BirthdayIn | None, tags: [] }]`;
    - `existing_people: [{ ref, person_id: UUID, changes: { how_we_met?: str, work?: str, birthday?: BirthdayIn | None, add_tags?: [str] } }]`;
    - `connections: [{ a, b, type, label = "", parent_type = "", space_id: UUID | None }]`;
    - `memory_aids: [{ about, text }]`;
    - `entries: [{ about, kind, date, note = "" }]`.
    - `a`, `b` and `about` are refs from the two people lists, or `"me"`.
  - **`save_capture(access, data: SaveIn) -> Capture`**, all inside `transaction.atomic`:
    - new people through `create_person(access, {name, how_we_met, work, birthday, tags, space_ids: [space_id] if space_id})`;
    - existing people need `can_see_person` (otherwise `Http404`); changes go through `update_person` for the fields, and through `set_tags` after an owner check for `add_tags`, with each `{field, before, after}` recorded;
    - connections through `create_relationship(access, a, b, space, {type, label, parent_type})`;
    - memory aids through `create_memory_aid(access, person, {"text": …})`;
    - entries through `log_interaction(access, person, {kind, occurred_on: date, label: "", note})`;
    - a ref not in the lists → 422.
  - **`SavedOut`:**
    - `capture_id`;
    - `added: { people, connections, memory_aids, entries, changes }` (counts);
    - `matched: [str]` (the names of the existing people, in order);
    - `people: [{ id, name, new: bool }]`, for the summary list and "Open {first name}'s page".
  - **`undo_capture(access, capture) -> dict`:**
    - owner only (anyone else → `Http404`); `undone_at` already set → `Conflict("This was already undone.")`;
    - deletes the created interactions, memory aids, relationships and people (hard delete; they're minutes old);
    - restores each changed field whose current value still equals `after` to `before`;
    - sets `undone_at`;
    - returns `{ removed: {…counts}, restored: n }`.
  - **Endpoints:** `POST /api/capture/save` → `SavedOut` (201), and `POST /api/capture/{uuid:capture_id}/undo` → `UndoneOut`.
  - **The job:** `forget_old_captures()` deletes `Capture` rows created more than a day ago, and returns how many.

- [ ] **Step 1: Write the failing tests:**
  - `test_saves_everything_at_once`:
    - new Tom (with work and tags) in Climbing; existing Emma with `work` changed;
    - the connection Tom–Emma `cousin`, a memory aid on Tom, an entry on Emma yesterday;
    - → 201 with `added == {people: 1, connections: 1, memory_aids: 1, entries: 1, changes: 1}`, and `matched == ["Emma"]`;
    - Tom is in Climbing; Emma's work changed; the entry resets her keep-in-touch (her latest interaction is that date);
    - the `Capture` row has no text field (assert on `Capture._meta` field names).
  - `test_a_link_to_me`: the connection `me`–Tom `friend` → a relationship with Ela's Me.
  - `test_nothing_is_saved_when_one_part_is_not_allowed` (Review Focus 3): a change to a person Ela only views in a shared space → 403, and the people, relationship, memory aid and interaction counts are all unchanged. A `person_id` she can't see → 404 with nothing saved.
  - `test_tags_only_from_the_owner`: `add_tags` on someone else's person → 403.
  - `test_unknown_refs_are_refused`: a connection to `"x9"` → 422.
  - `test_undo_removes_and_restores` (test_undo.py): after the save above, undo → Tom and his link, aid and entry are gone, and Emma's work is back. 200 with the counts.
  - `test_undo_keeps_newer_values` (Review Focus 5): change Emma's work again after the save, then undo → the newer value stays.
  - `test_undo_only_once_and_only_yours`: a second undo → 409; Deniz undoing Ela's → 404.
  - `test_old_captures_are_forgotten`: a capture created 2 days ago and one from now → the job deletes 1.
- [ ] **Step 2: Run** the tests.
Expected: FAIL.
- [ ] **Step 3: Implement**, plus `makemigrations capture`.
- [ ] **Step 4: Run** the whole backend suite, ruff, the missing-migrations check, and the type regeneration with typecheck.
Expected: PASS.
- [ ] **Step 5: Commit** `feat(capture): save a capture at once, and undo all of it`. Mention the migration.

---

### Task 4: The review's state (`frontend/src/features/capture/review.ts`)

**Files:**
- Create: `frontend/src/features/capture/queries.ts`, `frontend/src/features/capture/review.ts`
- Test: `frontend/src/features/capture/review.test.ts`

**Interfaces:**
- Consumes: Task 2's `DraftOut` and Task 3's `SaveIn` / `SavedOut` (generated types).
- Produces:
  - **`queries.ts`:**
    - `suggestCapture(body, signal) -> Promise<Draft>`;
    - `saveCapture(queryClient, body) -> Promise<Saved>`, which invalidates `['people']` and `['today']`;
    - `undoCapture(queryClient, id)`, the same.
  - **`review.ts`:**
    - `type Item` is one of `{ kind: 'person', ref, … }`, `{ kind: 'change', id, ref, field, from, to }`, `{ kind: 'connection', … }`, `{ kind: 'aid', … }`, `{ kind: 'entry', … }`, each with `ticked: boolean`;
    - a person carries `resolved: { as: 'new' } | { as: 'existing', candidate }` or `null` while unchosen;
    - `fromDraft(draft) -> Review`: every item ticked, `match` resolved to its candidate, `choose` unresolved, `new` resolved as new;
    - `changesFor(person, candidate) -> Item[]`: one `change` per field where the AI's value is non-empty and differs from `current`, `tags` as the added ones only, and none the candidate can't make (those become `{ disabled: why }`, with the reason "{owner first name}'s person: you can't change their details.");
    - `toggle(review, id) -> Review`: unticking a person unticks every item whose `ref`, `a`, `b` or `about` is theirs (Review Focus 4); ticking a person ticks only the person;
    - `resolve(review, ref, choice) -> Review`: choosing an existing person adds their `changesFor` items, and choosing new removes them;
    - `unresolved(review) -> string[]`: the refs of ticked people not yet chosen;
    - `counts(review) -> { selected, total }`;
    - `toSaveBody(review, spaceId) -> SaveIn`, ticked items only;
    - `summary(saved) -> string[]`: `["Added 1 person, 1 connection and 1 memory aid.", "Emma matched to someone you already had."]`, using `words()` and plural words, and `firstNameOf`.

- [ ] **Step 1: Write the failing tests:**
  - `fromDraft` resolves `match` and `new`, and leaves `choose` unresolved;
  - `changesFor`: "Work: Google → Spotify" when they differ, nothing when the AI's value is empty, a disabled item with its reason when `can_edit` is false, and only new tags;
  - `toggle` cascades for a new person and ticks back only the person (Review Focus 4);
  - `resolve` adds and removes the changes;
  - `unresolved`, `counts`;
  - `toSaveBody` puts ticked people in `new_people` or `existing_people` with only ticked changes, and leaves out unticked connections;
  - `summary` for 1 person, 1 connection and 1 memory aid, with one match; plurals ("2 people", "3 memory aids"); "1 timeline entry" / "2 timeline entries"; "1 change".
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/capture/review.test.ts`
Expected: FAIL.
- [ ] **Step 3: Implement** as pure functions, with no React.
- [ ] **Step 4: Run** the tests, then `npm run typecheck`.
Expected: PASS.
- [ ] **Step 5: Commit** `feat(capture): what the review holds, and what it saves`.

---

### Task 5: The capture page

**Files:**
- Create in `frontend/src/features/capture/`:
  - `CapturePage.tsx` (the steps);
  - `WriteStep.tsx` (2d, 2e and 2j);
  - `ReadingStep.tsx` (2f);
  - `ReviewStep.tsx` (2g, 2h), with the cards in `ReviewCards.tsx`;
  - `SavedStep.tsx` (2i).
- Modify: `frontend/src/router.tsx` (replace the `capture` placeholder with `CapturePage`)
- Test: `frontend/src/features/capture/Capture.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–4; PR 1's `aiSettingsQuery`, `aiUsage` and `PROVIDER_NAMES`; `PersonSearch`; `usePersonForm().openNew`; `warnAt`; `notify`; `SHORTCUTS`.

**The page:**
- **The steps:** `step` is `'write' | 'reading' | 'review' | 'saved'`. The text and `spaceId` survive Edit text and Try again.
- **Write:**
  - the textarea, labelled "What happened?" (visually the notebook page);
  - "Put everyone in a space" (`CheckboxField` plus a space `<select>`, of spaces you can add people to);
  - the three phrasing chips, each inserting its text at the cursor;
  - the AI line: "{Provider} · {model} · your key" or "· the server's, set up by {first name}";
  - Suggest (Ctrl/⌘+Enter, through `FormDialogFooter`'s shortcut pattern or `useShortcut` with `mod`);
  - the hint, and *Use the form instead* (`openNew()`).
  - **When `using` is `null`:** the 2j copy, *Add a key in Settings →* (`/settings/ai`), and *Fill in the form myself*. For an admin with no server AI, also "As an admin you can add one for everyone on this server."
- **Reading:**
  - "Reading it back…", the text, and Cancel (an `AbortController`, back to write);
  - after 10 s, "Local models can take a minute.";
  - a 424 or 409 shows its message with *Try again* and *Edit text*.
- **Review:**
  - "Here's what I read", then the cards in order: people (new, or "Who is “Emma”?" with candidates, "Someone else: create a new “Emma”" and `PersonSearch`), changes, connections, memory aids, entries;
  - each card has a checkbox with the item's own label ("New person · Tom", "Connection · Tom — Emma"…) and editable fields;
  - the connection type uses chips for the common ones (sibling, cousin, friend, colleague, partner, parent) plus a `<select>` of all; for `parent`, a parent-type select; for the "other family" types, the explanation line;
  - **the footer:**
    - "+ Add something the AI missed", a menu offering a person, connection, memory aid or entry;
    - "{n} of {m} selected", Discard (back to write, keeping the text);
    - **Save {n} items**: with `unresolved` refs, it calls `warnAt` on the first "Who is" card ("Choose who this is first."), otherwise it saves.
- **Saved:**
  - the `summary` lines, and a list of the saved people with "NEW" tags;
  - *Open {first name}'s page* for the first new person (or the first person);
  - *Capture something else*, which clears the text;
  - **Undo all of this**, which calls `undoCapture`, then `notify({ title: 'Undone: …' })` with the counts, and goes back to write with the text kept.
- **Shared rules:** `PageHeader title="Quick capture"`; works on phones and desktop and in light and dark; motion only via existing fades.

- [ ] **Step 1: Write the failing tests** (`fakeServer`, with an AI set, then not):
  - `it('says AI is off and offers the form')`;
  - `it('says whose AI it uses')`;
  - `it('suggests, reviews and saves')`:
    - type the text, choose a space, Suggest → the request body is `{ text, today, space_id }`;
    - review: "Who is “Emma”?", choose "Emma Yılmaz" → the "Work: Google → Spotify" card appears;
    - Save → the body equals the expected `SaveIn`;
    - the summary shows "Added 1 person, 1 connection and 1 memory aid." and "Emma matched to someone you already had.".
  - `it('waits for every “Who is” before saving')`: Save with Emma unchosen → the warning, and no request.
  - `it('unticks what belongs to someone unticked')`: untick Tom → his connection and aid are unticked, and "1 of 4 selected".
  - `it('can be cancelled while reading, and says why it failed')`: Cancel → back to write with the text; a 424 → its message, then Try again.
  - `it('says local models are slow')`: fake timers, 10 s → the line.
  - `it('undoes all of it')`: Undo all of this → POST `…/undo`, then the toast, then the write step with the text.
  - `it('adds something the AI missed')`: add a memory aid on Tom → it's in the save body.
- [ ] **Step 2: Run** `npx vitest run src/features/capture`
Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.
- [ ] **Step 5: Commit** `feat(capture): write, review and save a quick capture`.

---

### Task 6: End-to-end, docs, the real-app check, the PR

**Files:**
- Create: `frontend/e2e/fake-ai.mjs` (a Node `http` server on :8020: `/v1/models` lists `fake-model`; `/v1/chat/completions` returns a canned capture JSON for any text starting "Met Tom"), `frontend/e2e/quick-capture.spec.ts`
- Modify: `frontend/playwright.config.ts` (a third `webServer`: `node e2e/fake-ai.mjs`, url `http://localhost:8020/v1/models`), `docs/UI_FLOWS.md` §3.5, `AGENTS.md` (424 for AI failures in "API behavior"; `/api/capture` cookie-only), `README.md` (one line: Quick capture lives at "+"/Shift+N once AI is set)

- [ ] **Step 1: The end-to-end test.** As Ela, set "Only for you" to OpenAI-compatible with base URL `http://localhost:8020/v1` (the backend runs on the same machine as the fake) and model `fake-model`. Test connection → "Connected". Then capture "Met Tom {suffix} at the hackathon, likes climbing" → review shows "New person · Tom {suffix}" and "Memory aid · likes climbing" → Save 2 items → "Added 1 person and 1 memory aid." → *Open Tom's page* shows the memory aid → back, *Undo all of this* → Tom is gone from People. The fake answers with the name it finds after "Met " up to " at ", so runs don't clash.
  - Watch it fail once: expect "Save 3 items", see FAIL, revert.
  - Run `npx playwright test quick-capture` → setup + 2 passed.
- [ ] **Step 2: Docs.**
  - UI_FLOWS §3.5 as built: the AI line, chips, reading, cards, "Who is", changes, timeline entries, the summary and undo.
  - AGENTS: 424 for "the AI failed", and the capture router being cookie-only.
  - README: the line.
  - Commit `docs(capture): Quick capture as built`.
- [ ] **Step 3: In the real app.**
  - Use the throwaway `folkbook_preview` database with `seed_how.py`.
  - Point Ela's AI at a real model if one is at hand (a Gemini key, or a local Ollama through `host.docker.internal`); otherwise at a fake on :8020 that returns a realistic draft.
  - Desktop light: capture "Met Tom at the hackathon, designer at Spotify, he's Emma's cousin, likes climbing, coffee yesterday", review (choose Emma, see the work change), save, the summary, undo.
  - Phone dark: the stacked cards.
  - Reduced motion.
  - Screenshots. Console: only the 401s before logging in. Drop the database afterwards.
- [ ] **Step 4: Final review, PR.**
  - Whole-branch review (executing-plans), then the fix pass.
  - Push `feat/quick-capture` and open the PR with "Closes #32". Merge when CI is green, and delete the branch.
