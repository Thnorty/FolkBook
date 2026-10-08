# Recent imports and undo (PR 3 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings → Import / export → Recent imports, where each import can be shown (People filtered to it) or undone: the people it added go (unless you've written about them since), and what its merges added is taken back, with a short Undo that brings everything back.

**Architecture:** A new `imports/undo.py` with `undo_preview`, `undo_import` and `redo_import`. Undo soft-deletes the import's people through `people.services.delete_person` (so the existing purge job makes it final and keeps copies for others), and takes back each merge, keeping a snapshot (`Merge.taken_back`) so redo can put it back within the same `UNDO_WINDOW`. A periodic job deletes the photo files of merges that stayed undone. Frontend: a Recent imports part in Settings with a confirm dialog and a toast, and an `import` filter on the People page.

**Tech Stack:** Django + Django Ninja, Django tasks (periodic jobs); React + TypeScript, TanStack Query/Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-vcf-import-design.md` §5 (with merges reversed, as the user decided). PR 1 (#123) recorded `Import`, `Person.added_by_import`, `Merge` and `ContactMethod.added_by_import`; PR 2 (#124) added the people-list `import` filter and `visible_imports`.

## Global Constraints

- Imports are their owner's: everything goes through `visible_imports` (another user's import is 404); writing needs `can_undo_import(access)` (full read-write access, like `can_import`).
- "Written about since" means, by the user, on that person, after the import finished: a note (created or edited), a memory aid, a timeline entry, a keep-in-touch setting, or a link they made. What the import itself wrote (its notes) doesn't count. People written about since **stay**.
- Taking back a merge never removes anything changed since: a filled-in field is emptied only if it still holds the imported value, a photo only if it's still the imported one, the note text only if it's still at the end of the user's note (the note goes if nothing else is left). The contact details the merge added (`added_by_import`) are removed.
- Undo runs in one transaction. Redo is allowed only within `UNDO_WINDOW` (`people.services`, 1 minute) of the undo, else 409 "It's too late to bring them back." (the existing wording). Undoing an undone import is 409.
- Copy: "Recent imports", "{file} · {date} · {N} people added" / "· undone", "Show these people", "Undo this import…", dialog title "Undo the import of {file}?", "{N} people go", "{M} you've written about since stay", "{K} people you had lose the details this import added", confirm "Undo import", toast "Import undone" with action "Undo". People filter chip: "From {file}" (clearable).
- AGENTS.md as before (generated types, tokens, light/dark, mobile/desktop, tests, Conventional Commits, no attribution).

## Review Focus

- Someone the import added who is in a **shared space** (the import's space step, or later): undo deletes them the way tearing out does — through `delete_person` and the purge job, never a hard delete — so members who wrote about them keep copies (Task 2 test `test_a_shared_imported_person_goes_like_any_delete`).
- **Two merges into one person** in the same import, undone: both contact details go, the note loses both appended texts, nothing errors on the second (Task 2 test `test_two_merges_into_one_person_are_taken_back`).
- **Redo after the people were purged** (more than a minute later): 409 with the existing wording, nothing half-restored (Task 2 test `test_redo_too_late`).
- The user **edited a merged field** after the import (e.g. changed work): undo leaves the edit (Task 2 test `test_changed_since_stays`).
- An import whose people were all **deleted by hand** already: the preview says 0 go, and undo still takes back its merges (Task 2 test `test_nobody_left_to_go`).

---

### Task 1: Imports you can see, and when they finished

**Files:**
- Modify: `backend/imports/models.py` (`Import.finished_at = DateTimeField(null=True, blank=True)`: set at the end of `run_import`; `Merge.taken_back = JSONField(null=True, blank=True)`), migration `imports/0003_*` via `makemigrations`; `backend/imports/services.py` (set `finished_at`); `backend/access/policy.py` (`can_undo_import(access) -> bool` = `can_import(access)`); `backend/imports/schemas.py` (`ImportOut`: `id, file_name, created_at, added: int, merged: int, undone_at` — `added` counts the people it added, including any already deleted); `backend/imports/api.py` (`GET /api/imports` paginated 50, newest first; `GET /api/imports/{uuid:import_id}` → 404 unless visible)
- Test: `backend/tests/imports/test_recent.py`

**Interfaces:**
- Produces: `GET /api/imports` → `{items: ImportOut[], count}`; `GET /api/imports/{id}` → `ImportOut`; `can_undo_import`; `Import.finished_at`, `Merge.taken_back`.

- [ ] **Step 1: Write the failing tests:** `test_your_imports_newest_first` (two imports, counts `added`/`merged`), `test_someone_elses_import_is_not_found` (list empty for Deniz; detail 404), `test_finished_at_is_set` (via `run_import`), `test_query_count_does_not_grow` (list with 1 vs 5 imports).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; `makemigrations`. **Step 4:** pass; `npm run api:generate`; full backend suite.
- [ ] **Step 5: Commit** — `feat(import): list your recent imports`

---

### Task 2: Undo and redo

**Files:**
- Create: `backend/imports/undo.py`, `backend/imports/tasks.py` (`forget_taken_back_photos` task)
- Modify: `backend/imports/schemas.py` (`UndoPreviewOut: goes: list[PersonRef]; stays: list[PersonRef]; loses_details: list[PersonRef]`), `backend/imports/api.py` (`GET /api/imports/{id}/undo-preview`, `POST /api/imports/{id}/undo` → `ImportOut`, `POST /api/imports/{id}/redo` → `ImportOut`), `backend/jobs/scheduler.py` (`Periodic(imports_tasks.forget_taken_back_photos, every=1 minute)`)
- Test: `backend/tests/imports/test_undo.py`

**Interfaces:**
- Produces:
  ```python
  def undo_preview(access: Access, batch: Import) -> UndoPreviewOut
  def undo_import(access: Access, batch: Import) -> Import
  def redo_import(access: Access, batch: Import) -> Import
  def forget_taken_back_photos(now: datetime | None = None) -> int   # services-level, the task wraps it
  ```
  `taken_back` holds `{"contacts": [{kind, label, value, position}], "work": str?, "birthday": [d, m, y]?, "photo": [full, thumbnail]?, "note": str?, "note_deleted": bool?}` — exactly what was taken, so redo puts back only that.

- [ ] **Step 1: Write the failing tests** (build imports with `services.run_import` on small .vcf files, as in `test_import.py`):
  - `test_preview_says_who_goes_and_who_stays`: three added people; a memory aid on one, a link on another made after the import → `goes` = the third, `stays` = those two; a merge → `loses_details` = that person.
  - `test_the_imports_own_notes_dont_count`: an added person whose only note came from the .vcf → goes.
  - `test_undo_deletes_like_tearing_out`: `deleted_at` set on the people who go (not on those who stay); `undone_at` set; the purge job later deletes them for good.
  - `test_undo_takes_back_merges`: contact details added by the import removed; work/birthday emptied; note text removed (note deleted when nothing else is left); `taken_back` recorded.
  - `test_changed_since_stays` (Review Focus), `test_two_merges_into_one_person_are_taken_back` (Review Focus), `test_nobody_left_to_go` (Review Focus), `test_a_shared_imported_person_goes_like_any_delete` (Review Focus: person put in Climbing club, Deniz has a note → after the purge Deniz has a kept copy).
  - `test_redo_brings_everything_back`: people restored, contact details/fields/photo name/note back, `undone_at` cleared; `test_redo_too_late` (Review Focus, `freezegun`-free: set `undone_at` and `deleted_at` 2 minutes back).
  - `test_undoing_twice_is_409`, `test_someone_elses_import_is_404` (preview, undo, redo), `test_limited_access_cant_undo` (403).
  - `test_forget_taken_back_photos`: an undone merge's photo files are deleted after `UNDO_WINDOW`, not before; `taken_back["photo"]` cleared; safe to run twice.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** `undo_import`: in one transaction, `delete_person(access, p)` for each person in `goes`, take back each merge (in creation order, newest last), set `undone_at`. `redo_import`: check the window first (409 before any change), `restore_person` each person whose `deleted_at` equals the undo (within a second of `undone_at`), put back each `taken_back`, clear `undone_at`. The "since" queries compare with `finished_at` (or `created_at` for imports made before Task 1).
- [ ] **Step 4:** tests pass; api types; full suite; ruff.
- [ ] **Step 5: Commit** — `feat(import): undo an import, taking back what it added`

---

### Task 3: Recent imports in Settings

**Files:**
- Create: `frontend/src/features/imports/RecentImports.tsx`, `frontend/src/features/imports/UndoImportDialog.tsx`
- Modify: `frontend/src/features/imports/queries.ts` (`recentImportsQuery`, `importQuery(id)`, `undoPreviewQuery(id)`, `undoImport(queryClient, id)`, `redoImport(queryClient, id)` — both invalidate `['people']`, `['spaces']`, `['imports']`), `frontend/src/features/settings/ImportExportSettings.tsx` (the part after Import), `frontend/src/features/settings/Settings.test.tsx`

**Interfaces:**
- Consumes: Task 1–2 endpoints; `ConfirmDialog`, `useClosing`, `notify`.
- Produces: `importQuery(id)` for Task 4's chip.

- [ ] **Step 1: Write the failing tests** (`Settings.test.tsx`): `it('lists recent imports')` (rows with file, date, "5 people added", an undone one says "undone" and has no Undo), `it('shows an import's people')` (link `/people?import=i1`), `it('undoes an import after saying what happens, and can bring it back')` (dialog lists "3 people go", "1 you've written about since stays", "1 person you had loses the details this import added"; Undo import → `POST /api/imports/i1/undo`; toast "Import undone" → Undo → `POST /api/imports/i1/redo`).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (the last 5 imports; dates with `formatDay`). **Step 4:** pass; typecheck/lint/format/tests.
- [ ] **Step 5: Commit** — `feat(import): recent imports, with undo, in Settings`

---

### Task 4: People filtered to an import

**Files:**
- Modify: `frontend/src/features/people/search.ts` (`import?: string` in `PeopleSearch`), `PeoplePage.tsx` (pass it to the list; a chip "From {file}" with a clear button, using `importQuery`), `features/people/queries.ts` (the list query takes `import`), `PeoplePage.test.tsx`

- [ ] **Step 1:** test `it('shows the people from one import')`: `/people?import=i1` asks the list with `import=i1`, shows the chip "From contacts.vcf"; clearing it drops the param. Run → FAIL.
- [ ] **Step 2:** implement; tests pass; all frontend checks.
- [ ] **Step 3: Commit** — `feat(import): show the people one import added`

---

### Task 5: Docs, check in the app, PR

- [ ] **Step 1:** `docs/DECISIONS.md` (Undo an import: what goes, what stays, merges taken back, redo within the window, photo files forgotten by a job); `docs/UI_FLOWS.md` §3.6 step 6 as built.
- [ ] **Step 2: Check in the real app** (throwaway `folkbook_preview`, Chrome via Playwright, desktop light + phone dark): import with a merge, write a memory aid on one new person, Recent imports → Show these people → back → Undo this import (screenshot the dialog) → toast Undo → undo again; check the database each time.
- [ ] **Step 3:** every check clean (backend pytest + ruff; frontend typecheck, lint, format, tests).
- [ ] **Step 4: Commit**, push `feat/undo-import`, PR "Closes #33", CI green, merge, delete the branch, drop the preview database.
