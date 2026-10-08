# .vcf Import (PR 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import contacts from a .vcf through a 5-step wizard: pick who you know, merge or skip duplicates, optionally put the new people in a space.

**Architecture:** A new backend app `imports`. Our own vCard reader (`vcard.py`) turns bytes into `Card`s; `matching.py` finds the best match for each card in the user's book; `services.py` previews a file (nothing stored) and runs an import (one transaction) from the file plus the user's choices. The frontend wizard at `/people/import` keeps everything in React state and sends the file twice: once for the preview, once with the choices.

**Tech Stack:** Django + Django Ninja, PostgreSQL, pytest + factories; React + TypeScript, TanStack Query/Router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-08-vcf-import-design.md` (sections 1–3, "Errors and edge cases", and the PR 1 tests). PR 2 (fill in the blanks) and PR 3 (recent imports and undo) get their own plans.

## Global Constraints

- No new dependency (the reader uses `quopri`, `base64`, `re`, `datetime` from the standard library).
- Limits: 20 MB per file (`MAX_FILE_BYTES = 20 * 1024 * 1024`), 5,000 contacts (`MAX_CONTACTS = 5000`), photos at most `people.photos.MAX_BYTES`.
- Photos given as a URL are ignored; the server never downloads anything a file points to.
- Not a vCard: 422 `{"file": "That file isn't a .vcf contacts file."}`. Too big: 422 `{"file": "That file is too big (up to 20 MB)."}`. Too many: 422 `{"file": f"That file has more than {MAX_CONTACTS:,} contacts."}`. A bad choice: 422. A space the user can't add people to: 403. Errors are `{"detail": ...}` (existing handlers).
- Every read goes through `access/policy.py` (`visible_people`, `editable_spaces`, `can_change_space_people`, `can_edit_person`). Imports need full read-write access (`can_restore`-like rule: `include_private and not read_only and not is_space_limited`).
- AGENTS.md conventions: thin views → services; `{"items", "count"}` only for resource lists (the preview is one response, as the spec says); migrations for every model change; frontend uses the generated client (`npm run api:generate`), tokens only, light/dark/mobile/reduced motion; Conventional Commits, no AI attribution.
- Copy fixed by the spec/design: "Nothing is added until the last step", "{N} contacts in {file}", "Select who you actually know.", "Maybe in your book", "Hide {N} already in your book", "Continue with {N}", "Looks like {name} already exists", "Merge" / "Skip" / "Import as new", "Shared by {owner}, so you can't merge into them", "Put the {N} new people in a space?", "No space", "Imported {N} new people", "{K} left out — they stay in your phone", "Later".

## Review Focus

- A Windows/Outlook export with CRLF line endings and a UTF-8 BOM reads exactly like the LF version (Task 1 test `test_crlf_and_bom`).
- A UTF-16 file (BOM `FF FE`/`FE FF`, some Outlook versions) is decoded, not refused (Task 1 test `test_utf16`).
- Short numbers (`112`, a 4-digit short code) never match each other: phone matching needs at least 7 digits (Task 2 test `test_short_numbers_dont_match`).
- Two picked contacts merging into the same person add each detail once (Task 4 test `test_two_contacts_merge_into_one_person`).
- Importing the same file again: every contact imported the first time comes back as "already in your book" (Task 3 test `test_the_same_file_again_is_already_in_your_book`).

---

### Task 1: vCard reader

**Files:**
- Create: `backend/imports/__init__.py`, `backend/imports/apps.py` (`ImportsConfig`, name `imports`), `backend/imports/vcard.py`
- Modify: `backend/config/settings.py` (add `"imports"` to `INSTALLED_APPS` after `"exports"`)
- Test: `backend/tests/imports/__init__.py`, `backend/tests/imports/test_vcard.py`, samples in `backend/tests/imports/samples/` (`android-2.1.vcf`, `iphone-3.0.vcf`, `google-4.0.vcf`, written by hand to mimic each exporter; the 2.1 one has quoted-printable UTF-8 names "Ayşe Yılmaz" and "Şükrü Öztürk" with a soft line break)

**Interfaces:**
- Produces:
  ```python
  @dataclass
  class Detail:          # one phone or email
      value: str
      label: str         # "mobile" | "home" | "work" | ""

  @dataclass
  class Card:
      name: str
      phones: list[Detail]
      emails: list[Detail]
      birthday: tuple[int, int, int | None] | None   # (day, month, year)
      work: str                                       # "Title, Company", either part may be missing
      photo: bytes | None                             # embedded only
      note: str

  class NotAVcard(Exception): ...

  def read(data: bytes) -> tuple[list[Card], int]:   # (cards, skipped_without_name)
  ```
  `read` raises `NotAVcard` when there's no `BEGIN:VCARD`, and `ValidationError({"file": ...})` is the caller's job (Task 3).

- [ ] **Step 1: Write the failing tests** (`test_vcard.py`, table-driven where it fits)
  - `test_android_21_quoted_printable`: `read(samples/android-2.1.vcf)` → names `["Ayşe Yılmaz", "Şükrü Öztürk"]`; Ayşe's phones `[Detail("+90 532 111 22 33", "mobile")]`.
  - `test_iphone_30`: grouped `item1.TEL;type=CELL`, `BDAY;X-APPLE-OMIT-YEAR=1604:1604-06-14` → `(14, 6, None)`; `PHOTO;ENCODING=b;TYPE=JPEG:` base64 → `photo` starts with `b"\xff\xd8"`; `ORG:Acme;` + `TITLE:Designer` → `work == "Designer, Acme"`.
  - `test_google_40`: `PHOTO:data:image/jpeg;base64,...` decoded; `BDAY:--0614` → `(14, 6, None)`; `EMAIL;TYPE=work:` → label `"work"`.
  - `test_name_falls_back_to_n_then_org`: no `FN`, `N:Kowalska;Anna;;;` → `"Anna Kowalska"`; only `ORG:Bora Bike Shop` → `"Bora Bike Shop"`; nothing → skipped, `read(...)[1] == 1`.
  - `test_folding_and_escapes`: a folded `NOTE` line and `NOTE:Line one\nTwo\, three` → `"Line one\nTwo, three"`.
  - `test_birthdays`: `19900614`, `1990-06-14`, `--06-14`, `1604-06-14`, and invalid `1990-02-31` → `None` (dropped, not refused).
  - `test_url_photos_are_ignored`: `PHOTO;VALUE=uri:https://example.com/a.jpg` → `photo is None`.
  - `test_crlf_and_bom`, `test_utf16` (Review Focus): the iPhone sample with `\r\n` and a UTF-8 BOM, and encoded as UTF-16 with BOM, give the same cards.
  - `test_long_text_is_cut`: a 300-char name → 200 chars; a 400-char `TEL` value → 255.
  - `test_not_a_vcard`: `read(b"hello")` raises `NotAVcard`.

- [ ] **Step 2: Run them to see them fail**

  Run: `cd backend && uv run --env-file ../.env pytest tests/imports/test_vcard.py -q`
  Expected: errors, `ModuleNotFoundError: imports.vcard`.

- [ ] **Step 3: Implement `read(data: bytes) -> tuple[list[Card], int]` in `imports/vcard.py`**

  Decode: UTF-16 if it starts with a UTF-16 BOM, else UTF-8 (`utf-8-sig`), falling back to Latin-1. Unfold (`\r?\n[ \t]` joins; for quoted-printable, a line ending in `=` joins the next). Split each line into `group.NAME;params:value`; parameters accept both `TYPE=cell,voice` and bare 2.1 `CELL`. Quoted-printable values via `quopri.decodestring`, then the `CHARSET` (UTF-8 default). Unescape `\n \, \; \\` in text values. Labels: any of `cell`/`mobile`/`iphone` → `"mobile"`, `home`, `work`, else `""`. Lengths cut to the model's `max_length` (name 200, contact value 255, label 50, work 200). Module docstring says why it exists instead of `vobject` (2.1 quoted-printable).

- [ ] **Step 4: Run the tests until they pass**

  Run: `cd backend && uv run --env-file ../.env pytest tests/imports/test_vcard.py -q`
  Expected: all pass.

- [ ] **Step 5: Commit** — `feat(import): read contacts from .vcf files` (body: own reader, no dependency, why).

---

### Task 2: Matching contacts to people in the book

**Files:**
- Create: `backend/imports/matching.py`
- Test: `backend/tests/imports/test_matching.py`

**Interfaces:**
- Consumes: `Card`, `Detail` (Task 1); `access.policy.visible_people`, `visible_contact_methods`, `can_edit_person`.
- Produces:
  ```python
  Reason = Literal["phone", "email", "name", "initial"]

  @dataclass
  class Match:
      person: Person      # with .owner loaded
      reason: Reason
      sure: bool           # phone/email/name: True; initial: False
      can_merge: bool      # the user owns them and can_edit_person
      by_details: bool     # reason in ("phone", "email"): "already in your book"

  def fold(text: str) -> str          # casefold, accents off, "ı" → "i"
  def phone_key(value: str) -> str | None   # last 9 digits; None under 7 digits
  def find_matches(access: Access, cards: list[Card]) -> list[Match | None]
  ```

- [ ] **Step 1: Write the failing tests** (use the `world` fixture; Ela's people: Emma, Oskar, Ines with phone `+46 70 555 12 90`)
  - `test_same_phone`: card with `0705551290` → Ines, `reason == "phone"`, `sure`, `by_details`.
  - `test_same_email`: add `emma@example.com` to Emma; card `Emma@Example.com` → Emma, `"email"`.
  - `test_same_name_ignoring_case_and_accents`: Emma renamed "Ayşe Yılmaz"; card "ayse yilmaz" → `"name"`, `sure`, not `by_details`.
  - `test_first_name_and_initial`: Oskar renamed "Anna Kowalska"; card "Anna K." → `"initial"`, `sure is False`.
  - `test_phone_beats_name`: a card matching one person by name and another by phone → the phone match.
  - `test_short_numbers_dont_match` (Review Focus): two people/cards with `112` → `None`.
  - `test_shared_person_cant_be_merged`: Ela matching Tom (Defne's, seen via Hackathon) → `can_merge is False`.
  - `test_people_you_cant_see_never_match`: Sofia's card for "Tom" → `None`.
  - `test_torn_out_people_dont_match`: Emma with `deleted_at` set (in the undo window) → a card "Emma" gives `None`.
  - `test_query_count_does_not_grow_with_the_file`: 1 card vs 50 cards → same number of queries.

- [ ] **Step 2: Run them to see them fail**

  Run: `cd backend && uv run --env-file ../.env pytest tests/imports/test_matching.py -q`
  Expected: `ModuleNotFoundError: imports.matching`.

- [ ] **Step 3: Implement in `imports/matching.py`**

  Load `visible_people(access).select_related("owner")` with contact methods prefetched through `visible_contact_methods(access)` once; build dicts phone_key → person, folded email → person, folded name → person, and (folded first word, last initial) → person. Per card take the first hit in order phone, email, name, initial. `fold`: `unicodedata.normalize("NFKD")`, drop combining marks, `casefold()`, `"ı"→"i"`.

- [ ] **Step 4: Run the tests until they pass** (same command; all pass)

- [ ] **Step 5: Commit** — `feat(import): find who a contact already is in your book`

---

### Task 3: Preview endpoint

**Files:**
- Create: `backend/imports/schemas.py`, `backend/imports/services.py`, `backend/imports/api.py`
- Modify: `backend/config/api.py` (`api.add_router("/imports", imports_router)`), `backend/access/policy.py` (add `can_import(access) -> bool`: `access.include_private and not access.read_only and not access.is_space_limited`)
- Test: `backend/tests/imports/test_preview.py`, `backend/tests/access/` (one test for `can_import` alongside the other policy tests)

**Interfaces:**
- Consumes: `read`, `NotAVcard` (Task 1); `find_matches`, `Match` (Task 2).
- Produces:
  ```python
  # schemas.py
  class DetailOut(Schema): value: str; label: str
  class MatchOut(Schema):
      person: PersonRef; owner: str; photo: PhotoOut | None
      phones: list[str]; emails: list[str]; spaces: list[SpaceRef]   # what's there now, for the comparison
      reason: Literal["phone", "email", "name", "initial"]; sure: bool; can_merge: bool; by_details: bool
  class ContactOut(Schema):
      index: int; name: str; phones: list[DetailOut]; emails: list[DetailOut]
      birthday: Birthday | None; work: str; has_photo: bool; match: MatchOut | None
  class PreviewOut(Schema): file_name: str; contacts: list[ContactOut]; skipped: int

  # services.py
  MAX_FILE_BYTES = 20 * 1024 * 1024
  MAX_CONTACTS = 5000
  def read_upload(upload: UploadedFile) -> tuple[list[Card], int]   # limits + NotAVcard → ValidationError
  def preview(access: Access, upload: UploadedFile) -> PreviewOut
  ```
  `POST /api/imports/preview` (multipart `file`) → `PreviewOut`. `PermissionDenied` when not `can_import`.

- [ ] **Step 1: Write the failing tests**
  - `test_preview_lists_contacts_with_their_matches(api, world)`: upload a 3-card .vcf (one with Ines's phone) → 200; `contacts[0]` fields; the Ines card has `match.reason == "phone"`, `match.phones == ["+46 70 555 12 90"]`.
  - `test_preview_stores_nothing`: `Person.objects.count()` unchanged.
  - `test_not_a_vcard_is_422`: body `hello` → 422, msg "That file isn't a .vcf contacts file."
  - `test_limits`: monkeypatch `services.MAX_FILE_BYTES = 10` → 422 "That file is too big (up to 20 MB)."; `services.MAX_CONTACTS = 1` with 2 cards → 422 "That file has more than 1 contacts." (the message uses the constant).
  - `test_the_same_file_again_is_already_in_your_book` (Review Focus): preview after a stubbed import of the same cards (create the people directly with the same phones) → every match `by_details`.
  - `test_needs_full_access`: `services.preview(Access.limited(user, include_private=True, read_only=True), ...)` raises `PermissionDenied`; not logged in → 401.

- [ ] **Step 2: Run them to see them fail**

  Run: `cd backend && uv run --env-file ../.env pytest tests/imports/test_preview.py -q` → FAIL (404 / import errors).

- [ ] **Step 3: Implement** the schemas, `read_upload`, `preview`, the router and `can_import`. Size check reads at most `MAX_FILE_BYTES + 1` bytes.

- [ ] **Step 4: Run the tests until they pass**, then `uv run ruff check . && uv run ruff format --check .`, then `cd ../frontend && npm run api:generate` (the backend's `test_api_docs.py` checks the committed spec).

- [ ] **Step 5: Commit** (including `frontend/openapi.json` and `frontend/src/api/schema.d.ts`) — `feat(import): preview a .vcf with who's already in your book`

---

### Task 4: Running an import (models, merge, commit endpoint)

**Files:**
- Create: `backend/imports/models.py` (`Import`), `backend/imports/migrations/0001_initial.py`, `backend/people/migrations/0010_person_added_by_import.py` (via `makemigrations`)
- Modify: `backend/people/models.py` (`added_by_import = models.ForeignKey("imports.Import", null=True, blank=True, on_delete=models.SET_NULL, related_name="people")`), `backend/imports/schemas.py`, `backend/imports/services.py`, `backend/imports/api.py`
- Test: `backend/tests/imports/test_import.py`

**Interfaces:**
- Consumes: Tasks 1–3; `people.services.store_photo`, `photo_files`; `access.policy.can_change_space_people`.
- Produces:
  ```python
  class Import(BaseModel):   # owner FK User (CASCADE, related_name="imports"), file_name CharField(255), undone_at DateTimeField(null)

  class PickIn(Schema): index: int; action: Literal["new", "merge", "skip"]; into: UUID | None = None
  class ChoicesIn(Schema): picked: list[PickIn]; space: UUID | None = None
  class ImportOut(Schema): import_id: UUID; added: int; merged: int; left_out: int; space: SpaceRef | None

  def run_import(access: Access, upload: UploadedFile, choices: ChoicesIn) -> ImportOut
  def merge_into(person: Person, card: Card, user: User) -> None   # adds what's missing, overwrites nothing
  ```
  `POST /api/imports` (multipart `file`, form field `choices` = JSON of `ChoicesIn`) → `ImportOut`. `left_out` = contacts not picked + picked with `skip`.

- [ ] **Step 1: Write the failing tests**
  - `test_imports_the_picked_contacts_as_new_people`: 3 cards, pick 0 and 2 as `new` → 2 people owned by the user, `added_by_import` set, phones/emails/birthday/work/note (as the user's `Note`) saved; `added == 2, left_out == 1`.
  - `test_photos_come_through_the_photo_pipeline`: a card with a JPEG → `photo` and `photo_thumbnail` stored (WebP).
  - `test_merge_adds_only_whats_missing`: Ines (phone, work "Nurse") merged with a card having the same phone, a new email, work "Doctor", a birthday → phone not duplicated, email added, work stays "Nurse", birthday filled, `added_by_import` stays `None`, note appended after a blank line to an existing note.
  - `test_two_contacts_merge_into_one_person` (Review Focus): both cards add the same new email → it's there once.
  - `test_space_for_new_people_only`: `space=climbing` → new people in Climbing club; merged person's spaces unchanged.
  - `test_bad_choices` (parametrized → 422): unknown index; `merge` without `into`; `into` that isn't the card's match; `into` a shared person (`can_merge` False).
  - `test_space_you_cant_add_to_is_403`: Ela picks Hackathon (viewer) → 403.
  - `test_merge_target_gone`: target soft-deleted between preview and import → 422 "Emma isn't in your book any more; go back and choose again."
  - `test_one_transaction_and_no_files_left_behind`: second card's photo is broken (`b"not a photo"`) → nothing created, no files in `MEDIA_ROOT/photos` (same check as `tests/exports/test_restore.py::stored_files`).
  - `test_needs_full_access` and 401, as in Task 3.

- [ ] **Step 2: Run them to see them fail**

  Run: `cd backend && uv run --env-file ../.env pytest tests/imports/test_import.py -q` → FAIL.

- [ ] **Step 3: Add the models, run `uv run --env-file ../.env python manage.py makemigrations imports people`**, check the two migration files are as above.

- [ ] **Step 4: Implement `run_import` and `merge_into`**

  Re-read with `read_upload`, re-match with `find_matches`, validate every `PickIn` against the fresh matches before writing. One `transaction.atomic()`; collect stored photo names and delete them in an `except BaseException` (as `exports/restore.py` does). New people: `Person` + `ContactMethod`s (positions in order) + `Note` when `card.note`; space via `SpacePerson(added_by=user)` after `can_change_space_people` (else `PermissionDenied`). A broken photo: 422 `"{name}'s photo can't be read."`. Comparing details for merge uses `phone_key` / `fold` from Task 2.

- [ ] **Step 5: Run the tests until they pass**, run `cd frontend && npm run api:generate`, then the whole backend suite: `uv run --env-file ../.env pytest -q` → all pass.

- [ ] **Step 6: Commit** (with the regenerated API files) — `feat(import): add picked contacts, merging into people you have` (body: migrations `imports.0001`, `people.0010`).

---

### Task 5: Wizard, steps 1–2 (upload, choose)

**Files:**
- Create: `frontend/src/features/imports/queries.ts`, `frontend/src/features/imports/ImportPage.tsx`, `frontend/src/features/imports/UploadStep.tsx`, `frontend/src/features/imports/ChooseStep.tsx`, `frontend/src/features/imports/Stepper.tsx`, `frontend/src/features/imports/ImportPage.test.tsx`
- Modify: `frontend/src/router.tsx` (route `people/import`, child of `appRoute`, component `ImportPage`)

**Interfaces:**
- Consumes: `POST /api/imports/preview`, `POST /api/imports` (generated types `components['schemas']['PreviewOut' | 'ImportOut' | 'ChoicesIn']`); `formUpload`, `FileButton`, `PageHeader`, `useClosing`.
- Produces:
  ```ts
  export type ImportPreview = components['schemas']['PreviewOut']
  export type Contact = ImportPreview['contacts'][number]
  export type Choice = { action: 'new' | 'merge' | 'skip'; into?: string }
  export function previewImport(file: File): Promise<ImportPreview>
  export function runImport(queryClient: QueryClient, file: File, choices: components['schemas']['ChoicesIn']): Promise<ImportResult>
  // runImport invalidates ['people'] and ['spaces'] after success
  type Step = 'upload' | 'choose' | 'duplicates' | 'space' | 'done'
  ```
  `ImportPage` owns `{ file, preview, picked: Set<number>, choices: Map<number, Choice>, space?: string, result? }`.

- [ ] **Step 1: Write the failing tests** (mock `./queries`' `previewImport`/`runImport` with `vi.mock`, as `Settings.test.tsx` does for restore, because jsdom files can't go into real form uploads)
  - `it('uploads a file and lists its contacts, none picked')`: upload `contacts.vcf` → "214 contacts in contacts.vcf" style heading (use 3 contacts), every checkbox unchecked, "Continue with 0" disabled.
  - `it('searches and hides people already in your book')`: typing "gre" leaves Greta; "Hide 1 already in your book" removes the `by_details` contact; "Maybe in your book" shows on a non-`by_details` match.
  - `it('says why a file can't be read')`: `previewImport` rejects with `ApiError(422, [{loc: ['body','file'], msg: "That file isn't a .vcf contacts file."}])` → `role="alert"` with that text, still on Upload.
  - `it('shows the steps')`: the stepper marks Upload done and Choose current (`aria-current="step"`).

- [ ] **Step 2: Run them to see them fail**

  Run: `cd frontend && npx vitest run src/features/imports` → FAIL.

- [ ] **Step 3: Implement** the queries (`formUpload`; `choices` sent as a JSON string field), the route, `Stepper` (numbers, ✓ when done, `aria-current="step"`), `UploadStep` (drop zone + `FileButton accept=".vcf,text/vcard,text/x-vcard"`, hints copy from 4p, "Nothing is added until the last step"), `ChooseStep` (search, list with checkbox rows: initials, name, first phone/email, "Maybe in your book" tag; "Hide {N} already in your book" toggle; footer "{N} selected", Back, "Continue with {N}"). Mobile: header with Back/Next (4u). Tokens only.

- [ ] **Step 4: Run the tests until they pass**, then `npm run typecheck && npm run lint && npm run format:check`.

- [ ] **Step 5: Commit** — `feat(import): upload a .vcf and choose who you know`

---

### Task 6: Wizard, steps 3–5 (duplicates, space, done)

**Files:**
- Create: `frontend/src/features/imports/DuplicateStep.tsx`, `frontend/src/features/imports/SpaceStep.tsx`, `frontend/src/features/imports/DoneStep.tsx`
- Modify: `frontend/src/features/imports/ImportPage.tsx`, `frontend/src/features/imports/ImportPage.test.tsx`, `frontend/src/features/spaces/SharedSpaceConfirm.tsx` (optional `count?: number`: title `"{peopleCount(count)} will be visible to {peopleCount(members)}"`, description "They'll see their basic profiles and links to people in {space}. Your notes and memory aids stay private.", confirm "Add them to {space}")

**Interfaces:**
- Consumes: Task 5's state and `runImport`; `spacesQuery` (filter to `role` owner/editor for chips); `SharedSpaceConfirm`.
- Produces: nothing new for other tasks.

- [ ] **Step 1: Write the failing tests**
  - `it('asks about each duplicate, then skips the step when there are none')`: two picked contacts with matches → "Looks like Anna K. already exists", reason line ("Same first name and initial"), both sides shown; Merge on the first, "Import as new" on the second; with no matches the wizard goes straight from Choose to Space.
  - `it('only lets you merge into your own people')`: a `can_merge: false` match shows "Shared by Defne, so you can't merge into them" and no Merge button.
  - `it('puts the new people in a space, asking first if it's shared')`: picking a shared space shows "2 people will be visible to …"; confirming, then "Import 2 people" calls `runImport` with `{picked: [...], space: 's1'}`.
  - `it('says what happened')`: result `{added: 5, merged: 1, left_out: 208, space: {name: 'Work'}}` → "Imported 5 new people, in Work", "1 merged into Anna Kowalska", "208 left out — they stay in your phone"; "Later" goes to `/people`; the second button opens `/people?needs_details=true` labelled "Show them" (Fill in the blanks comes in PR 2).

- [ ] **Step 2: Run them to see them fail** (`npx vitest run src/features/imports` → FAIL)

- [ ] **Step 3: Implement** the three steps. Duplicates: one card per matched picked contact, "1 of N possible duplicates", details the merge would add in the accent color (as 4r), Merge / Skip / Import as new (`Choice`); on phones the question is a bottom sheet (`FormDialog small` pattern). Space: chips from editable spaces + "No space", list of new people below, merged people noted ("Anna Kowalska, merged — keeps Uni '15"). Done: copy above. Picks without a decision default to `new`.

- [ ] **Step 4: Run the tests until they pass**, then the whole frontend suite: `npm test` → all pass; typecheck/lint/format clean.

- [ ] **Step 5: Commit** — `feat(import): duplicates, a space and the summary`

---

### Task 7: Entry point, docs, check in the app, PR

**Files:**
- Modify: `frontend/src/features/settings/ImportExportSettings.tsx` (new first `SettingsPart` "Import": an `ExportRow` "Contacts (.vcf)" / "From your phone or Google Contacts. You choose who comes in." with a `Link` button "Import contacts" to `/people/import`), `frontend/src/features/settings/Settings.test.tsx` (the link and its target), `docs/DECISIONS.md` ("Import (.vcf)" entry: own reader, match rules, merge never overwrites, one transaction, limits), `docs/UI_FLOWS.md` §3.6 (match the wizard; drop the Today reminder in favour of Needs details, per the spec)

- [ ] **Step 1: Write the failing test** — `it('links to the contacts import')` in `Settings.test.tsx`: link "Import contacts" has `href="/people/import"`.
- [ ] **Step 2: Run it to see it fail**, implement, run `npm test` → all pass.
- [ ] **Step 3: Check in the real app** on a throwaway `folkbook_preview` database (as for restore): import the three sample files from Task 1 plus a merge into an existing person and a shared space, in Chrome via a Playwright script, desktop light and phone dark (screenshots of every step). Fix anything found, with a test.
- [ ] **Step 4: Run every check**: backend `pytest -q`, `ruff check`, `ruff format --check`; frontend `npm run typecheck && npm run lint && npm run format:check && npm test`. All clean.
- [ ] **Step 5: Commit** (`feat(import): import contacts from Settings`), push `feat/vcf-import`, open the PR ("Part of #33", not "Closes": PR 2 and 3 follow), wait for CI, merge when green and delete the branch; drop the preview database.
