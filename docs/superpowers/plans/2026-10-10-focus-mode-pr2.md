# Focus mode (PR 2 of 2 for #34) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish focus mode. It shows a person's 1- or 2-step neighborhood with a focus bar, a count line and the empty and "gone" states, and Focus works on desktop as well as phones.

**Architecture:** Frontend only: the backend already serves `GET /api/graph/neighborhood/{id}?hops=1|2`. The URL gains `hops`. Counting lives in a small plain-data module, `focus.ts`, tested directly. The graph page gets a focus bar in place of today's "Focused on … Show everyone" line, and the desktop peek panel gets Focus. Esc works the same way it does for a route.

**Tech Stack:** React + TypeScript, TanStack Query and Router, Vitest + Testing Library (Reagraph stubbed).

**Spec:** `docs/superpowers/specs/2026-10-09-how-do-i-know-design.md` §5 and the PR 2 lines of "Tests". Design screens 3h and 3i in `design/FolkBook.dc.html`.

## Global Constraints

- People read "steps", never "hops". The URL param is still `hops`.
- Copy, verbatim:
  - the bar: "Back to everyone", "Focused on {full name}", the switch "1 step" / "2 steps";
  - the count line: "{n} direct · {m} more at 2 steps · {k} others hidden" (the middle part only with 2 steps; "1 other hidden" for one; the hidden part left out when nobody is hidden);
  - "Nobody else is connected to {first name} yet.";
  - "This person isn't in your book anymore." This is the same string as the route summary's: it lives in one place (`features/graph/copy.ts`).
- Esc goes back to everyone through `useShortcut`, only while no peek is open. One Esc shortcut serves both the route and focus.
- No double-click to refocus: select someone, then Focus.
- AGENTS.md:
  - the neighborhood query's key starts `['people', 'graph', 'focus', …]`;
  - design tokens only;
  - the switch reuses the page's `Toggle` (with `aria-pressed`);
  - mobile + desktop, light + dark.

## Review Focus

1. **Focusing someone else after picking "2 steps":** the new person starts at 1 step, because `setFocus` drops `hops`. Test in Task 3.
2. **A filter that would hide the focused person** (a space chip they aren't in): they stay drawn, because they're in `keep`. Test in Task 3.
3. **Esc with a peek open:** the peek closes first, and a second Esc goes back to everyone. Test in Task 3.
4. **`?hops=2` without a focus, or `?hops=3`:** ignored. Test in Task 1.
5. **Switching 1 → 2 steps while the 2-step answer loads:** the 1-step neighborhood stays drawn, not the whole graph flashing in between (`placeholderData: keepPreviousData`). Test in Task 3.

---

### Task 1: `hops` in the URL and the query

**Files:**
- Modify: `frontend/src/features/graph/search.ts`, `frontend/src/features/graph/queries.ts`
- Test: `frontend/src/features/graph/search.test.ts`

**Interfaces:**
- Produces:
  - `GraphSearch = { how?: string; focus?: string; hops?: 2 }`. 1 step is the default, so only `2` is ever stored.
  - `validateGraphSearch` keeps `hops: 2` only with a focus, from `2` or `'2'`. With a route, both `focus` and `hops` are spelled out as `undefined`, for the same reason `focus` already is: the router merges the URL's other params.
  - `neighborhoodQuery(personId: string, hops: 1 | 2)`: key `['people', 'graph', 'focus', personId, hops]`, with `placeholderData: keepPreviousData`.

- [ ] **Step 1: Write the failing tests** in `search.test.ts`:
  - `validateGraphSearch({ focus: 'emma', hops: 2 })` → `{ focus: 'emma', hops: 2 }`; the same with `hops: '2'`;
  - `{ focus: 'emma', hops: 3 }` → `{ focus: 'emma' }`;
  - `{ hops: 2 }` → `{}`;
  - `{ how: 'tom', hops: 2 }` → `{ how: 'tom' }`.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/graph/search.test.ts`
Expected: the hops cases FAIL.

- [ ] **Step 3: Implement** the Interfaces above, and update the one caller of `neighborhoodQuery` in `GraphPage.tsx` to pass `focusHops` (`hops ?? 1`).

- [ ] **Step 4: Run** `npx vitest run src/features/graph && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit** `feat(graph): 1 or 2 steps of focus in the URL`

---

### Task 2: What the count line says

**Files:**
- Create: `frontend/src/features/graph/focus.ts`, `frontend/src/features/graph/copy.ts`
- Modify: `frontend/src/features/graph/RouteSummary.tsx` (use `PERSON_GONE`)
- Test: `frontend/src/features/graph/focus.test.ts`

**Interfaces:**
- Produces:
  - `PERSON_GONE = "This person isn't in your book anymore."`, in `copy.ts`.
  - `focusCounts(neighborhood: GraphData, graph: GraphData, personId: string): { direct: number; further: number; hidden: number }`:
    - `direct`: the people at the other end of the neighborhood's edges that touch `personId`, each counted once, of any kind (the same steps the backend walks);
    - `further`: the neighborhood's other people;
    - `hidden`: the whole graph's people who aren't in the neighborhood.
    - Everyone except the focused person is counted, your Me included: it's drawn like anyone else here.
  - `focusLine(counts, hops: 1 | 2): string`: "8 direct · 5 more at 2 steps · 135 others hidden". The middle part only appears with `hops === 2`. The last part reads "1 other hidden" for one, and is left out when nobody is hidden.

- [ ] **Step 1: Write the failing tests** in `focus.test.ts`, using a small graph: me–emma, emma–tom, emma–kerem (`member`), tom–ola, plus anna alone.
  - Emma's 1-step neighborhood (me, emma, tom, kerem): `{ direct: 3, further: 0, hidden: 2 }`, which reads "3 direct · 2 others hidden".
  - Her 2-step neighborhood (plus ola): `{ direct: 3, further: 1, hidden: 1 }`, which reads "3 direct · 1 more at 2 steps · 1 other hidden" with `hops` 2.
  - Two lines between the same two people count them once.
  - Anna's neighborhood (just anna): `{ direct: 0, further: 0, hidden: 5 }`.
  - Nobody hidden: `focusLine({ direct: 2, further: 0, hidden: 0 }, 1)` → "2 direct".

- [ ] **Step 2: Run** `npx vitest run src/features/graph/focus.test.ts`
Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement**, and switch `RouteSummary` to `PERSON_GONE`.

- [ ] **Step 4: Run** `npx vitest run src/features/graph`
Expected: PASS. The route tests are unchanged.

- [ ] **Step 5: Commit** `feat(graph): count who focus mode shows and hides`

---

### Task 3: The focus bar, and Focus on desktop

**Files:**
- Modify: `frontend/src/features/graph/GraphPage.tsx`
- Test: `frontend/src/features/graph/Graph.test.tsx` (page tests, in a `describe('focus mode')`)

**Interfaces:**
- Consumes:
  - Task 1's `hops` and `neighborhoodQuery(id, hops)`;
  - Task 2's `focusCounts`, `focusLine` and `PERSON_GONE`;
  - PR 1's `toCanvas(…, keep)`, `PeekPanel` `actions`, `showRoute()` (clears the URL) and `useShortcut(…, { enabled })`.

**The page:**
- **The focus bar** (replaces the "Focused on … and the people one step away. / Show everyone" line). It's a `role="group"` named "Focus" and holds:
  - a ghost Button "Back to everyone" with an `ArrowLeft` icon;
  - "Focused on {full name}";
  - a `<Kbd shortcut={{ key: 'Escape' }} />` on desktop;
  - the switch: two `Toggle`s, "1 step" and "2 steps", in a `role="group"` named "Steps". "2 steps" sets `hops: 2`; "1 step" drops it.
- **The line under the bar:**
  - the count line, `focusLine(focusCounts(focused.data, graph.data, focus), hops)`;
  - "Nobody else is connected to {first name} yet." when the neighborhood holds only them;
  - `PERSON_GONE` when the neighborhood answers 404. The whole graph stays drawn, and Back to everyone still works.
- **Focusing:** `setFocus(id)` sets `{ focus: id }`, dropping `hops` and any route.
- **Esc:** the existing route shortcut becomes `BACK = { key: 'Escape' }`, `enabled: Boolean(how || focus) && !selected`, running `showRoute()`, which clears the URL.
- **Desktop peek:** its `actions` gain a "Focus" button (also for your Me, as on the phone sheet). It sets focus and leaves the peek open, like the sheet.
- **Canvas:** `keep` holds the focused person, so filters never hide them.

- [ ] **Step 1: Write the failing tests.** Give `server()` neighborhoods for Emma:
  - `GET /api/graph/neighborhood/emma`, answering per `hops`:
    - 1 step: me, emma, tom, kerem;
    - 2 steps: also a new `ola` node, with a tom–ola edge.
  - Plus `GET /api/graph/neighborhood/anna` (just anna) and `GET /api/graph/neighborhood/gone` → 404.

  Tests:
  - `it('focuses from the desktop peek, and goes back to everyone')`:
    - click Emma, then the peek's Focus → "Focused on Emma Yılmaz", and the count line "3 direct" (her 1-step neighborhood is all of `GRAPH`'s 4 people, so nobody is hidden);
    - "Back to everyone" → no focus bar, the whole graph drawn, the URL `{}`.
  - `it('shows 2 steps')`: from `/graph?focus=emma`, "2 steps" → `hops: 2` in the URL, Ola drawn, and a "· 1 more at 2 steps" part. "1 step" → `hops` gone, Ola gone.
  - `it('starts a new focus at 1 step')` (Review Focus 1): at `?focus=emma&hops=2`, focus Kerem from the peek → the URL is `{ focus: 'kerem' }`.
  - `it('keeps the focused person when a filter would hide them')` (Review Focus 2): at `?focus=emma`, the "Family" chip → "Emma Yılmaz" is still drawn.
  - `it('leaves focus on Esc, after closing the peek')` (Review Focus 3): at `?focus=emma`, click Tom, then Esc → the peek closes, focus stays; Esc again → URL `{}`.
  - `it('keeps the neighborhood drawn while 2 steps load')` (Review Focus 5): hold the 2-step answer on a promise you resolve by hand. Click "2 steps" → Emma's 1-step people are still drawn, and Anna isn't. Resolve → Ola appears.
  - `it('says when nobody else is connected')`: `/graph?focus=anna` → "Nobody else is connected to Anna yet.", and no count line.
  - `it('says when the focused person is gone')`: `/graph?focus=gone` → `PERSON_GONE` and "Back to everyone".
  - The existing tests (the phone sheet's Focus, and 'switches between focus and a route') follow the new bar's words: "Back to everyone" replaces "Show everyone".

- [ ] **Step 2: Run** `npx vitest run src/features/graph`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the page as described above.

- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 5: Commit** `feat(graph): focus on someone's 1 or 2 steps, on desktop too`

---

### Task 4: Docs, the check in the real app, the PR

**Files:**
- Modify: `docs/UI_FLOWS.md` §3.9 (the Focus mode bullet)

- [ ] **Step 1: Docs.**
  - Update §3.9's Focus mode bullet to:
    - *Focus* in the peek panel and the phone sheet;
    - the bar: Back to everyone, also Esc · "Focused on …" · 1 step / 2 steps;
    - the count line;
    - the nobody and gone states;
    - focus being in the URL;
    - no double-click.
  - Commit `docs(graph): focus mode in the graph flows`.
- [ ] **Step 2: In the real app.**
  - Use a throwaway `folkbook_preview` database: Ela with a few friends and second-step people, and one person with no links. The `seed_how.py` seed is enough.
  - Backend on :8000, Vite on :5173, Chrome via Playwright.
  - Desktop light: Focus from the peek, 2 steps, the count line, Back, Esc; screenshot.
  - Phone dark: Focus from the node sheet, if a node can be tapped; otherwise open `?focus=` directly. Screenshot the bar wrapping at 390 px.
  - Check the desktop peek's top bar still fits with three actions.
  - Console errors: only the 401s before logging in. Drop the database afterwards.
- [ ] **Step 3: Final review, PR.**
  - Whole-branch review (executing-plans), then the fix pass.
  - Push `feat/focus-mode` and open the PR with "Closes #34". Merge when CI is green, and delete the branch.
