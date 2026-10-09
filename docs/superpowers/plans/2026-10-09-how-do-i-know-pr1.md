# "How do I know…?" (PR 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick a person and see how you know them: the route from your Me drawn in ink on the graph, spelled out step by step, with other routes, from the graph header, the peek panel, the phone sheet and a profile.

**Architecture:** The backend already finds routes (`GET /api/graph/paths/{id}`); it gains `former` on each step. The frontend keeps `how` (and the existing focus) in the graph page's URL, turns a route into canvas data in `graphModel.ts` (ink lines, the rest dimmed, never hidden by filters), and shows a summary card (desktop) / sheet (phones). Wording lives in one helper shared by the canvas lines and the route's steps.

**Tech Stack:** Django Ninja + pytest; React + TypeScript, TanStack Query/Router, Reagraph (stubbed in tests), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-09-how-do-i-know-design.md` §1–§4 (and the PR 1 lines of "Tests"). Design screens 3f, 3g, 3i in `design/FolkBook.dc.html`.

## Global Constraints

- "Steps", never "hops", in anything a person reads.
- Copy, verbatim: "How do I know…?", "How do I know them?", "How do I know {first name}?", "How you know {first name} · {n} steps" ("1 step"), "Also via {name}: {label}, then {label}", "Show", "Back to the shortest", "Open {first name}'s profile", "Clear", "You haven't said how you know {first name} yet.", "Connect…", "Finding the way…", "This person isn't in your book anymore.", "{first name} came into your book with {spaces}, shared by {owner first name}."
- A step reads like a line: a stored link → `linkLabel` ("former …" when ended); `member` → "shares {space}"; `space` → "in {space}".
- Ink draws step by step within `DURATION.ink` (0.7 s); with reduced motion all steps show at once (the canvas can't fade a line; showing at once is the no-motion version).
- No new endpoints, no new privacy rules; business rules (which route wins) stay in the backend.
- AGENTS.md: generated API types (`npm run api:generate` after the backend change), queries in `features/graph/queries.ts` under `['people', 'graph', …]`, tokens only, `useShortcut` for keys, `<Kbd>` to show `/`, mobile + desktop, light + dark.

## Review Focus

1. **Two lines between the same two people** (a friend link and "shares Hackathon" between two users): the ink goes on the line the step used (the stored link), not the dotted one. Test in Task 3.
2. **`?how=` naming your own Me** (typed or stale): nothing is drawn and no "You haven't said how you know…" about yourself; the param is ignored. Test in Task 5.
3. **`?how=` and `?focus=` both in the URL:** only the route shows (focus is dropped). Test in Task 5.
4. **Show an alternative, then pick someone else:** the new person's shortest route shows, not "alternative 2" of the new list. Test in Task 5.
5. **A filter that would hide someone on the route** (a space chip, "Family only", "Hide former" with a former link on the route): the route's people and lines stay drawn. Test in Task 3.

---

### Task 1: `former` on route steps

**Files:**
- Modify: `backend/graph/schemas.py` (`HopOut`), `backend/graph/api.py` (`_paths_out`)
- Test: `backend/tests/graph/test_api.py`, `backend/tests/graph/test_queries.py`
- Regenerate: `frontend/src/api/schema.d.ts`, `frontend/openapi.json` (`npm run api:generate`)

**Interfaces:**
- Produces: `HopOut.former: bool` (from `Edge.is_former`); the frontend type `components['schemas']['HopOut']` has `former: boolean`.

- [ ] **Step 1: Write the failing tests**

`test_api.py`:
```python
def test_a_step_says_when_its_link_has_ended(api, world):
    RelationshipFactory(owner=world.ela, person_a=world.ela.me, person_b=world.emma,
                        type="partner", is_former=True, ended_on=None)
    (path, *_) = api.login(world.ela).get(f"/graph/paths/{world.emma.pk}").json()["paths"]
    assert [(h["type"], h["former"]) for h in path["hops"]] == [("partner", True)]
```
(If the factory/DB constraint needs `ended_on` for a former link, set a date; the assertion stays.) And extend `test_how_do_i_know_tom` with `assert [h["former"] for h in path["hops"]] == [False, False]`.

`test_queries.py`:
```python
def test_a_route_never_uses_a_link_the_viewer_cannot_see(world):
    # Deniz sees Ines and Oskar (Climbing club), but not Ela's private link between them.
    hidden = RelationshipFactory(owner=world.ela, person_a=world.ines, person_b=world.oskar)
    for path in paths_to(access(world, "deniz"), world.oskar, alternatives=5):
        assert hidden not in {hop.edge.relationship for hop in path}
```
(Check `world` first: if Ines and Oskar already have a visible link, use two Climbing people without one.)

- [ ] **Step 2: Run them**

Run: `cd backend && uv run --env-file ../.env pytest tests/graph -q`
Expected: the `former` tests FAIL (`KeyError: 'former'`); the hidden-link test may already PASS (the policy covers it): keep it as the privacy pin.

- [ ] **Step 3: Implement:** `former: bool` on `HopOut`; `_paths_out` adds `"former": hop.edge.is_former`.

- [ ] **Step 4: Run and regenerate**

Run: `cd backend && uv run --env-file ../.env pytest tests/graph -q && uv run ruff check . && uv run ruff format --check .`, then `cd frontend && npm run api:generate && npm run typecheck`
Expected: PASS; `schema.d.ts` gains `former: boolean` in `HopOut`.

- [ ] **Step 5: Commit** `feat(graph): say when a route's step is an ended link`

---

### Task 2: Wording for lines and steps

**Files:**
- Create: `frontend/src/lib/lists.ts`, `frontend/src/features/graph/route.ts`
- Modify: `frontend/src/features/graph/graphModel.ts` (export the line wording), `frontend/src/features/kept/labels.ts` (use `andList`)
- Test: `frontend/src/features/graph/route.test.ts`, `frontend/src/lib/lists.test.ts`

**Interfaces:**
- Produces:
  - `andList(items: string[]): string` in `lib/lists.ts`: `Intl.ListFormat(undefined, { type: 'conjunction' })` ("A, B and C"); `kept/labels.ts` uses it instead of its own formatter.
  - `lineLabel(line: Pick<ApiEdge, 'kind' | 'type' | 'label' | 'former' | 'space'>): string | undefined` in `graphModel.ts` (today's private `edgeLabel`, renamed, exported, plus `kind === 'space'` → `in ${space.name}`). `toCanvas` keeps using it.
  - In `route.ts`: `type Route = components['schemas']['PathOut']`, `type Step = Route['hops'][number]`;
    - `stepLabel(step: Step): string` = `lineLabel(step) ?? ''`;
    - `routeTitle(name: string, steps: number): string` → "How you know Tom · 2 steps" / "· 1 step" (first name);
    - `alsoVia(route: Route): string` → "Also via Emma Yılmaz: friend, then cousin" (full name of the first step's person; the labels joined with ", then ");
    - `whyLine(person: Pick<Person, 'id' | 'name' | 'is_me' | 'is_mine' | 'owner' | 'spaces'>): string | null`.

- [ ] **Step 1: Write the failing tests** (`route.test.ts`, with `step(kind, extra)` and `person(extra)` builders):
  - `stepLabel`: `relationship`/`friend` → "friend"; `relationship`/`partner` + `former: true` → "former partner"; `relationship`/`met_at` + `label: 'Hackathon 2026'` → whatever `linkLabel` gives for it (assert equals `linkLabel({type:'met_at', label:'Hackathon 2026'})`); `member` + space Hackathon 2026 → "shares Hackathon 2026"; `space` + space Hackathon 2026 → "in Hackathon 2026".
  - `routeTitle('Tom Bergqvist', 2)` → "How you know Tom · 2 steps"; `routeTitle('Tom Bergqvist', 1)` → "How you know Tom · 1 step".
  - `alsoVia` of Me→Emma (friend)→Tom (cousin) → "Also via Emma Yılmaz: friend, then cousin"; of a one-step route Me→Emma (friend) → "Also via Emma Yılmaz: friend".
  - `whyLine`: Tom owned by Defne (`is_mine: false`, `owner: {id:'defne', name:'Defne Aydın'}`, spaces [Hackathon 2026]) → "Tom came into your book with Hackathon 2026, shared by Defne."; with two spaces → "…with Hackathon 2026 and Climbing club, shared by Defne."; your own person (`is_mine: true`) → `null`; another user's Me (`owner.id === id`) → `null`; your Me (`is_me: true`) → `null`; no visible spaces → "Tom came into your book through Defne."
  - `lists.test.ts`: `andList(['A'])` → "A"; `andList(['A','B','C'])` matches `/A, B,? and C/`.

- [ ] **Step 2: Run them:** `cd frontend && npx vitest run src/features/graph/route.test.ts src/lib/lists.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement** to the Interfaces above.
- [ ] **Step 4: Run them, plus the graph and kept tests:** `npx vitest run src/features/graph src/lib src/features/kept src/features/today && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(graph): words for a route's steps, shared with the lines`

---

### Task 3: The route on the canvas

**Files:**
- Modify: `frontend/src/features/graph/graphModel.ts`, `frontend/src/features/graph/NetworkCanvas.tsx`, `frontend/src/test/setup.ts` (the Reagraph stub)
- Create: `frontend/src/features/graph/useStepReveal.ts`
- Test: `frontend/src/features/graph/Graph.test.tsx` (model tests), `frontend/src/features/graph/useStepReveal.test.ts`

**Interfaces:**
- Consumes: Task 2's `lineLabel`, `Route`.
- Produces:
  - `toCanvas(graph, filters, palette, faces = {}, keep: ReadonlySet<string> = new Set())`: people in `keep` are drawn whatever the filters (and their clusters). Existing callers unchanged.
  - `CanvasEdge` gains `ink?: true` and `size?: number`; `INK_SIZE = 3`.
  - `withRoute(canvas: ReturnType<typeof toCanvas>, route: Route, steps: number, palette: Palette): ReturnType<typeof toCanvas> & { route: string[] }`: the first `steps` steps in ink. For each step, the canvas line between the two people whose id starts with `${step.kind}:` gets `ink: true, size: INK_SIZE` and keeps its words; with no such line, a line `{ id: 'route:<i>', source, target, label: stepLabel(step), fill: palette.edge, ink: true, size: INK_SIZE }` is added. `route` = the route's people ids (Me first) + its ink line ids.
  - `routePeople(route: Route): string[]` (Me and each step's target), for `keep` and for fitting the view.
  - `labelLinesOf` keeps the words on `ink` lines.
  - `NetworkCanvas` prop `route?: string[]`: when set, `actives` = `route` ∪ `linesAround(...)` (everything else dims); passes `size` through.
  - `useStepReveal(steps: number, key: string): number`: 0 → `steps`, one more every `DURATION.ink * 1000 / steps` ms, restarting when `key` changes; with `useReducedMotion()` it returns `steps` at once.

- [ ] **Step 1: Write the failing tests**

In `Graph.test.tsx` (a `describe('the route on the canvas')`, with a `ROUTE` builder for Me→Emma (relationship friend)→Tom (relationship cousin) and a `SPACE_ROUTE` Me→Defne (member, Hackathon)→Tom (space, Hackathon)):
  - `it('inks the lines the route takes and lights up its people')`: `withRoute(toCanvas(GRAPH, NO_FILTERS, PALETTE), ROUTE, 2, PALETTE)` → edges `e1` and `e3` have `ink: true, size: 3` and keep their labels ("friend", "cousin"); `e2` has neither; `route` equals `['me','emma','tom','e1','e3']`.
  - `it('adds a line for a step through someone’s space')`: on a graph with `defne` and a member edge `member:h:defne` and no line to Tom, `SPACE_ROUTE` adds `{ id: 'route:1', source: 'defne', target: 'tom', label: 'in Hackathon 2026', ink: true }` and inks the member line.
  - `it('inks the line the step used when two people have two')` (Review Focus 1): Me–Defne has both `relationship:r1` (friend) and `member:h:me` (shares Hackathon); a route whose first step is `relationship` inks `relationship:r1` only.
  - `it('draws only the steps reached so far')`: `steps = 1` inks `e1` only; `route` includes `me`, `emma`, `e1` (people ahead aren't lit yet).
  - `it('never hides the route behind a filter')` (Review Focus 5): with `{ ...NO_FILTERS, spaces: [FAMILY.id] }` and `keep = new Set(routePeople(ROUTE))`, Emma and Tom are still nodes; with `hideFormer` and a route whose step is the former `e2`, the step still has an ink line (`route:<i>` added, label "former partner").
  - `it('keeps the words on ink lines')`: `labelLinesOf(withRoute(...).edges, null)` keeps "friend" and "cousin".

  `useStepReveal.test.ts` (fake timers, `renderHook`): 3 steps → 0, then 1 after 233 ms, 3 by 700 ms and no further; a new `key` starts again from 0; with reduced motion (set through `setAppearance({ motion: 'reduce' })`, reset after) → 3 at once.

  In `test/setup.ts`'s stub, a line's text gets `(ink)` when `edge.size` is set (after the dashed/dotted marks), so page tests can read the route.

- [ ] **Step 2: Run them:** `npx vitest run src/features/graph` → the new tests FAIL (`withRoute` not defined); existing ones still PASS.
- [ ] **Step 3: Implement** to the Interfaces above.
- [ ] **Step 4: Run:** `npx vitest run src/features/graph && npm run typecheck && npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(graph): draw a route in ink, never hidden by filters`

---

### Task 4: One person search for Connect and the graph

**Files:**
- Create: `frontend/src/features/people/PersonSearch.tsx`
- Modify: `frontend/src/features/person/ConnectionForm.tsx` (`PersonPicker` uses it)
- Test: `frontend/src/features/people/PersonSearch.test.tsx`; `features/person/Connections.test.tsx` must still pass unchanged

**Interfaces:**
- Produces: `PersonSearch({ id, label, placeholder, exclude = [], autoFocus, onPick, extra, inputRef }: { id: string; label: string; placeholder: string; exclude?: string[]; autoFocus?: boolean; onPick: (person: Person) => void; extra?: (search: string) => ReactNode; inputRef?: Ref<HTMLInputElement> })`. The search box and up to 6 matches from `peopleListQuery({ search })` (deferred, only when not blank), minus `exclude`; `extra(search)` renders as the list's last item (Connect's "Create “…” as a new person"). `Person` is `features/people/queries.ts`'s (`PersonOut`, the people list's items).
- `PersonPicker` becomes `PersonSearch` with `id="connect-who"`, `label="Who?"`, `placeholder="Search your notebook"`, `exclude={[exclude]}`, `autoFocus`, and the create row as `extra`.

- [ ] **Step 1: Write the failing test** `PersonSearch.test.tsx`: with `fakeServer` answering `GET /api/people` (search `ay` → Ayşe, Aylin, Me), typing "ay" lists Ayşe and Aylin but not the excluded id; clicking Aylin calls `onPick` with her item; `extra` renders below the matches; a blank box shows no list.
- [ ] **Step 2: Run:** `npx vitest run src/features/people/PersonSearch.test.tsx` → FAIL (module missing).
- [ ] **Step 3: Implement**, moving the markup and query out of `PersonPicker`.
- [ ] **Step 4: Run:** `npx vitest run src/features/people src/features/person && npm run typecheck` → PASS, Connect tests unchanged.
- [ ] **Step 5: Commit** `refactor(people): one person search for Connect and the graph`

---

### Task 5: "How do I know…?" on the graph page

**Files:**
- Create: `frontend/src/features/graph/search.ts`, `frontend/src/features/graph/HowDoIKnow.tsx` (the header picker), `frontend/src/features/graph/RouteSummary.tsx`
- Modify: `frontend/src/router.tsx` (`validateSearch` on the graph route), `frontend/src/features/graph/GraphPage.tsx`, `frontend/src/features/graph/queries.ts`, `frontend/src/features/people/PeekPanel.tsx` (an `actions` slot), `frontend/src/app/nav.ts` (`SHORTCUTS.howDoIKnow = { key: '/' }`)
- Test: `frontend/src/features/graph/Graph.test.tsx` (page tests), `frontend/src/features/graph/search.test.ts`

**Interfaces:**
- Consumes: Task 1's `former`; Task 2's `routeTitle`, `stepLabel`, `alsoVia`, `whyLine`; Task 3's `toCanvas(…, keep)`, `withRoute`, `routePeople`, `useStepReveal`, `NetworkCanvas` `route`; Task 4's `PersonSearch`.
- Produces:
  - `type GraphSearch = { how?: string; focus?: string }`, `validateGraphSearch(search: Record<string, unknown>): GraphSearch`: strings only, and `focus` is dropped when `how` is set (Review Focus 3).
  - `pathsQuery(personId: string)`: key `['people', 'graph', 'paths', personId]`, `GET /api/graph/paths/{person_id}` (default alternatives).
  - `PeekPanel` prop `actions?: ReactNode`, shown in its top bar before "Expand to page".
  - Focus moves from `useState` into `?focus=` (still 1 step; PR 2 adds `hops`). Picking a route clears `focus`; Focus clears `how`.

**The page:**
- **Header picker (`HowDoIKnow`):** a labelled box "How do I know…?" (`PersonSearch`, `id="how-do-i-know"`, excluding your Me), with `<Kbd shortcut={SHORTCUTS.howDoIKnow} />` on desktop; `useShortcut(SHORTCUTS.howDoIKnow, …)` focuses it. Picking sets `how`. While `how` is set it shows the person's name and a ✕ (`aria-label="Clear the route"`) that removes `how`.
- **Summary (`RouteSummary`):** one `<section aria-label="How you know {first name}">`: a card at the canvas's top left from `md` up, a sheet from the bottom on phones. States: loading "Finding the way…"; 404 "This person isn't in your book anymore." + Clear; no route "You haven't said how you know {first name} yet." + **Connect…** (`openConnect(personId)`); a route: `routeTitle`, the steps as an ordered list (each person, then the step's words, ending with the person), `whyLine` if any, `alsoVia` lines with **Show** (the shown route's line is replaced by **Back to the shortest**), **Open {first name}'s profile**, **Clear**.
- **Canvas:** `toCanvas(shown, filters, palette, faces, keep = routePeople(route))` then `withRoute(…, shownSteps)` with `useStepReveal(route.hops.length, \`${how}:${shownIndex}\`)`; `NetworkCanvas route={…}`; the view fits the route's people once all steps show (`canvas.current?.fitNodesInView(routePeople)`).
- **Esc:** clears the route only when no peek is open (the peek's own Esc closes it first).
- **Your Me:** `how` naming your Me is treated as unset (Review Focus 2).
- **Entry points:** the desktop peek panel's `actions` and the phone `NodeSheet` get "How do I know them?" (sets `how` to that person, closes the peek/sheet), not for your Me.
- The shown alternative resets to the shortest whenever `how` changes (Review Focus 4).

- [ ] **Step 1: Write the failing tests** (`Graph.test.tsx`: extend `server()` with `GET /api/graph/paths/tom` → the shortest Me→Emma→Tom plus one alternative Me→Kerem→Tom (add a `me–kerem` friend and `kerem–tom` friend edge to the fixture graph only for this server option), `GET /api/graph/paths/kerem` → one route, `GET /api/graph/paths/anna` → `{ paths: [] }`, `GET /api/graph/paths/gone` → 404, and `GET /api/people/tom` (owned by Defne, spaces [Hackathon 2026])):
  - `it('shows how you know someone you pick')`: type "Tom" in "How do I know…?", pick Tom → the region "How you know Tom" has "How you know Tom · 2 steps", the steps "friend" and "cousin", "Tom came into your book with Hackathon 2026, shared by Defne.", "Also via Kerem Yılmaz: friend, then friend"; the lines show `me–emma friend (ink)` and `emma–tom cousin (ink)`; the URL has `how=tom`.
  - `it('shows another route, and back')`: Show → the Kerem lines are ink and Emma's aren't; "Back to the shortest" → as before.
  - `it('clears the route')`: Clear removes the summary, every "(ink)" and `how` from the URL; the same with the box's ✕; the same with Esc.
  - `it('closes the peek before the route on Esc')`: with `how=tom` and Emma's peek open, Esc closes the peek only; a second Esc clears the route.
  - `it('starts from the keyboard')`: pressing `/` focuses the "How do I know…?" box.
  - `it('says when there is no route')`: `/graph?how=anna` → "You haven't said how you know Anna yet."; **Connect…** opens the connect dialog for Anna.
  - `it('says when the person is gone')`: `/graph?how=gone` → "This person isn't in your book anymore." and nothing in ink.
  - `it('starts from a person’s peek panel and phone sheet')`: click Emma → "How do I know them?" → `how=emma`; Me's peek has no such button.
  - `it('ignores a route to yourself')` (Review Focus 2): `/graph?how=me` → no summary, no "(ink)".
  - `it('shows the route, not focus, when the URL asks for both')` (Review Focus 3): `/graph?how=tom&focus=tom` → the summary, no "Focused on".
  - `it('shows the shortest route of the next person you pick')` (Review Focus 4): Show Tom's alternative, then pick Kerem → Kerem's only route is drawn, no "Back to the shortest".
  - `it('switches between focus and a route')`: Focus (phone sheet) then pick a route → no "Focused on"; the route's summary then Focus → no summary.
  - `search.test.ts`: `validateGraphSearch({ how: 'tom', focus: 'emma', x: 1 })` → `{ how: 'tom' }`; `{ focus: 'emma' }` → `{ focus: 'emma' }`; non-strings and empty strings dropped.
- [ ] **Step 2: Run:** `npx vitest run src/features/graph` → the new tests FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run:** `npm test && npm run typecheck && npm run lint && npm run format:check` → all pass.
- [ ] **Step 5: Commit** `feat(graph): How do I know…? shows the route from you to someone`

---

### Task 6: From a profile, docs, the check in the real app, the PR

**Files:**
- Modify: `frontend/src/features/person/ConnectionsSection.tsx` (the link), `docs/UI_FLOWS.md` (§3.9)
- Test: `frontend/src/features/person/Connections.test.tsx`

- [ ] **Step 1: Write the failing test** `it('links to how you know them')`: on Emma's profile the Connections section has a link "How do I know Emma?" to `/graph?how=emma`; on your own Me's profile it doesn't.
- [ ] **Step 2: Run** `npx vitest run src/features/person/Connections.test.tsx` → FAIL.
- [ ] **Step 3: Implement:** a small accent `Link` (`to="/graph" search={{ how: personId }}`) under the section's rows (also when there are none), not for `person.is_me`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint` → PASS. Commit `feat(person): ask how you know someone from their profile`.
- [ ] **Step 5: Docs.** UI_FLOWS §3.9: a "How do I know…?" bullet (the picker and `/`, the peek panel / sheet / profile entry points, the ink route and the summary with its states, other routes with Show, Clear and Esc); drop "How do I know…?" from the "Later" line. Commit `docs(graph): How do I know…? in the graph flows`.
- [ ] **Step 6: In the real app** (throwaway `folkbook_preview` database: Ela with Emma (friend) and Emma–Tom (cousin) links; Defne sharing Hackathon 2026 with Ela, Tom in it; Anna with no links; backend :8000, Vite :5173, Chrome via Playwright): desktop light: pick Tom from the box (and with `/`), screenshot the ink route and summary, Show the alternative, Clear, Esc; Anna's "You haven't said…" and Connect…; from Emma's profile link. Phone dark (390×844): the sheet from the node sheet's button, screenshot. Reduced motion: the route appears whole. Console errors: only the 401s before logging in. Drop the database afterwards.
- [ ] **Step 7: Final review, PR.** Whole-branch review (executing-plans), fix pass, push `feat/how-do-i-know`, open the PR with "Part of #34" (PR 2 closes it), merge when CI is green and delete the branch.
