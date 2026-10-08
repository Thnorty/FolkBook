# Fill in the blanks (PR 2 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A card-by-card mode that asks "How do you know Lars?" for people without "how we met" (an import's people, or everyone under Needs details), with space chips, Friend of…, a memory aid, keyboard shortcuts on desktop and swipes on phones.

**Architecture:** One small backend change: an `import` filter on the people list (own imports only, through a new `visible_imports` in the policy) and `from_import` on the person detail (owner only). Everything else is frontend: a page at `/people/fill-in` that reads the queue once, shows one card at a time and saves through the existing person, memory-aid and connection endpoints.

**Tech Stack:** Django + Django Ninja; React + TypeScript, TanStack Query/Router, Motion (`m` components, drag), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-08-vcf-import-design.md` §4. PR 1 (merged, #123) built the import; PR 3 builds recent imports and undo.

## Global Constraints

- Privacy: imports are their owner's. `from_import` is `None` for anyone but the person's owner; the `import` filter only matches the viewer's own imports (another user's import id gives an empty list, never an error that reveals it). All of it through `access/policy.py`.
- No new endpoint for saving: `PATCH /api/people/{id}` (`how_we_met`, `space_ids`), `addMemoryAid`, and the existing connection dialog (`openConnect`).
- Shortcuts (show them with `<Kbd>`): Save & next = Ctrl/⌘+Enter, Skip = Ctrl/⌘+→, 1–5 pick a quick answer when no text field has focus.
- Motion: swipe and card changes are UI transitions ≤ 450 ms (`DURATION` in `src/motion/tokens.ts`); with reduced motion (`useReducedMotion()`) nothing slides or tilts, cards fade in over 150 ms (`REDUCED_TRANSITION`), and swiping is off (buttons and keys only).
- Copy from the design (4v, 4w): "Fill in the blanks", "{n} of {total}", "From {file} · {first phone or email}", "How do you know {first name}?", placeholder "Stockholm office, the 2024 offsite", "Friend of…", "+ add a memory aid", "Skip", "Save & next", "← Swipe to skip", "Swipe to save →", "Finish later", list states "Done" / "Now", "All done".
- AGENTS.md: generated API types only, tokens only, light/dark, mobile + desktop, tests for every behavior, Conventional Commits without attribution.

## Review Focus

- A person deleted, merged away or filled in elsewhere while the mode is open: saving them gives an error; the card says so and moves on instead of getting stuck (Task 3 test `it('moves on when someone is gone')`).
- More than 50 people need details (the list is paginated): the mode works through the first 50 and then offers to keep going with the rest (Task 3 test `it('offers to keep going after a full page')`).
- Pressing 1–5 while typing in "How do you know…?" types the digit, never toggles a chip (Task 3 test `it('types digits in the text field')`).
- A shared space picked by key or click asks first, like the person form, and "don't ask again" is respected (Task 3 test `it('asks before a shared space')`).
- Skipping everyone, then reopening: skipped people are still there (they still need details) (Task 3 test `it('keeps skipped people for next time')`).

---

### Task 1: `import` filter and `from_import`

**Files:**
- Modify: `backend/access/policy.py` (`visible_imports(access) -> QuerySet[Import]`: `Import.objects.filter(owner=access.user)`, empty for space-limited access), `backend/people/api.py` (`list_people(..., import_id: UUID | None = Query(None, alias="import"))`: `people.filter(added_by_import__in=visible_imports(access).filter(pk=import_id))`), `backend/people/schemas.py` (`ImportRef(Schema): id: UUID; file_name: str`; `PersonDetailOut.from_import: ImportRef | None` with a resolver returning the import only when `obj.owner_id == viewer`)
- Test: `backend/tests/imports/test_fill_in.py`; regenerate `frontend/openapi.json` + `schema.d.ts`

**Interfaces:**
- Produces: `GET /api/people?needs_details=true&import={id}`; `PersonDetail.from_import: { id, file_name } | null`.

- [ ] **Step 1: Write the failing tests**
  - `test_the_import_filter_lists_that_imports_people`: two imports by Ela (create `Import` rows and set `added_by_import`), filter by the first → only its people.
  - `test_another_users_import_lists_nobody`: Deniz (member of Climbing club, where Ela's imported Oskar is) filters by Ela's import → `{"items": [], "count": 0}`.
  - `test_from_import_is_only_for_the_owner`: Ela's detail of an imported Oskar has `from_import == {"id": ..., "file_name": "contacts.vcf"}`; Deniz's detail of Oskar has `None`.
  - `test_space_limited_access_sees_no_imports`: `visible_imports(Access.limited(..., space_ids=[...]))` is empty.
  - Query count of the people list with the filter doesn't grow with people (reuse the list's existing pattern).
- [ ] **Step 2:** `uv run --env-file ../.env pytest tests/imports/test_fill_in.py -q` → FAIL.
- [ ] **Step 3:** implement as in Files; `from_import` needs `select_related("added_by_import")` where the detail is loaded.
- [ ] **Step 4:** tests pass; `npm run api:generate`; full backend suite and ruff clean.
- [ ] **Step 5: Commit** — `feat(import): list an import's people, and say where someone came from`

---

### Task 2: Open the connection dialog with a kind picked

**Files:**
- Modify: `frontend/src/features/person/useConnectionForm.ts` (`openConnect: (personId: string, kind?: ConnectionKind) => void`), `ConnectionFormProvider.tsx` (carry `kind` in `Open`), `ConnectionForm.tsx` (`kind` prop as the initial `useState`), the dialog that renders it
- Test: `frontend/src/features/person/Connections.test.tsx`

**Interfaces:**
- Produces: `openConnect(personId, 'friend')` opens the form with Friend already chosen.

- [ ] **Step 1:** test `it('can open with a kind already picked')`: render a small consumer calling `openConnect('emma', 'friend')` → the "Friend" option is checked.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npx vitest run src/features/person` → pass.
- [ ] **Step 5: Commit** — `feat(people): open the connect form with a kind picked`

---

### Task 3: The fill-in page

**Files:**
- Create: `frontend/src/features/fillIn/FillInPage.tsx` (page, queue, desktop list), `FillInCard.tsx` (one card), `queries.ts` (`fillInQueueQuery(importId?)`), `FillInPage.test.tsx`
- Modify: `frontend/src/router.tsx` (route `people/fill-in` with `validateSearch` → `{ import?: string }`)

**Interfaces:**
- Consumes: Task 1 (`import` filter, `from_import`), Task 2 (`openConnect(id, 'friend')`); `personQuery`, `updatePerson`, `addMemoryAid`, `spacesQuery`, `canAddPeople`, `useSharedSpaceConfirmed`, `SharedSpaceConfirm`, `useShortcut`, `Kbd`, `PageHeader`.
- Produces: `FillInCard` props `{ person: PersonDetail; position: number; total: number; onSaved(): void; onSkipped(): void }` (Task 4 adds swiping to it).

- [ ] **Step 1: Write the failing tests** (fake server as in `ImportPage.test.tsx`; three people needing details, one with `from_import` and a phone)
  - `it('asks how you know each person, and saves')`: "1 of 3", "From contacts.vcf · +46 70 222 33 44", "How do you know Lars?"; type "Stockholm office" → Save & next → `PATCH /api/people/lars` with `{how_we_met: 'Stockholm office'}`; "2 of 3" shows the next person.
  - `it('puts them in a space from a chip, and adds a memory aid')`: chips are the user's owner/editor spaces, busiest first, at most 4, then "Friend of…"; clicking "Work" then Save & next sends `space_ids` with Work added to their current spaces; "+ add a memory aid" → text → saved with `POST /api/people/lars/memory-aids`.
  - `it('asks before a shared space')`: clicking a space with members shows `SharedSpaceConfirm`; with "don't ask again" ticked the next card doesn't ask.
  - `it('opens the connect form for Friend of…')`: clicking "Friend of…" calls `openConnect('lars', 'friend')`.
  - `it('works with the keyboard')`: Ctrl+Enter saves, Ctrl+ArrowRight skips (no write), "1" toggles the first chip; `it('types digits in the text field')`: typing "1990 class" in the field leaves chips alone.
  - `it('shows the queue on desktop')`: the list marks the first "Done" after saving and the current "Now"; "Finish later" links back.
  - `it('says all done at the end')`, `it('keeps skipped people for next time')` (after skipping all, "All done", and re-opening lists them again), `it('moves on when someone is gone')` (PATCH → 404: notify "Lars isn't in your book any more" and show the next), `it('offers to keep going after a full page')` (count 52, page of 50 → after the 50th: "2 more need details" + "Keep going" re-reads the queue).
  - `it('fills in an import's people only')`: `/people/fill-in?import=i1` asks with `import=i1`.
- [ ] **Step 2:** `npx vitest run src/features/fillIn` → FAIL.
- [ ] **Step 3: Implement.** The queue is read once when the page opens (`fillInQueueQuery` with `staleTime: Infinity`, removed on leave), so saved people stay listed as Done. The card loads `personQuery(id)` for its contact details and spaces. Save & next is enabled once something is entered or picked; it sends one `PATCH` (how_we_met, space_ids) plus the memory aid, then moves on. Chips show the space's color (`data-space`), and shared spaces (members > 0) the shared icon used in the sidebar. Phones: full-width card, list hidden; desktop: the list on the left (4w) and the shortcut hint line under the card.
- [ ] **Step 4:** tests pass; `npm run typecheck && npm run lint && npm run format:check && npm test`.
- [ ] **Step 5: Commit** — `feat(import): fill in the blanks, card by card`

---

### Task 4: Swipe on phones

**Files:**
- Create: `frontend/src/features/fillIn/swipe.ts` (`swipeOf(offsetX: number, velocityX: number): 'save' | 'skip' | null`: past 120 px or faster than 500 px/s; right saves, left skips), `swipe.test.ts`
- Modify: `FillInCard.tsx` (wrap in `m.div` with `drag="x"`, `dragConstraints={{ left: 0, right: 0 }}`, `dragElastic` 0.6, rotate up to 6° with the drag; on drag end call `swipeOf` and save/skip; only below `md` and never with reduced motion. Add `DURATION.card: 0.28` (a fill-in card leaving or arriving) to `src/motion/tokens.ts`; with reduced motion use `REDUCED_TRANSITION`)

**Interfaces:**
- Consumes: Task 3's `FillInCard`.

- [ ] **Step 1:** `swipe.test.ts`: `(130, 0) → 'save'`, `(-130, 0) → 'skip'`, `(40, 600) → 'save'`, `(40, 100) → null`; and in `FillInPage.test.tsx` `it('has no swipe with reduced motion')`: with `setAppearance({ motion: 'reduce' })` the card has no `draggable` and the "Swipe to save" hint is gone.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** tests pass.
- [ ] **Step 5: Commit** — `feat(import): swipe through the cards on phones`

---

### Task 5: Entry points, docs, check in the app, PR

**Files:**
- Modify: `frontend/src/features/imports/DoneStep.tsx` ("Fill in the blanks →" to `/people/fill-in?import={result.import_id}`, replacing "Show them"), `frontend/src/features/people/PeoplePage.tsx` (with the Needs details filter on, a "Fill in the blanks" button next to it), their tests; `docs/UI_FLOWS.md` §3.6 step 5 (as built)

- [ ] **Step 1:** tests: Done step link `href="/people/fill-in?import=i1"`; People with `needs=true` shows the "Fill in the blanks" link to `/people/fill-in`. Run → FAIL; implement; pass.
- [ ] **Step 2: Check in the real app** (throwaway `folkbook_preview` database, Chrome via Playwright, desktop light and phone dark): import a .vcf, go from Done into Fill in the blanks, save one with a chip and a memory aid, skip one, use the keys on desktop and a swipe on the phone; screenshots of each.
- [ ] **Step 3:** every check (backend pytest + ruff; frontend typecheck, lint, format, tests) clean.
- [ ] **Step 4: Commit** (`feat(import): fill in the blanks from the import and from Needs details`), push `feat/fill-in-the-blanks`, PR "Part of #33", CI green, merge, delete the branch, drop the preview database.
