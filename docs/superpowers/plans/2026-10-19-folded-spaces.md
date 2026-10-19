# Folded space bubbles (#35) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a notebook of more than 300 people, the network shows you + 2 steps and folds everyone else into one bubble per space, which unfolds on click; "Show all" is remembered per device.

**Architecture:** A pure `fold.ts` decides who is near and builds bubbles and their "via N" lines from the graph the page already has; `toCanvas()` draws bubbles as big synthetic nodes; `NetworkView` decides when to fold, keeps unfolded spaces, turns a bubble click into an unfold and shows the banner. No backend change.

**Tech Stack:** React + TypeScript, Reagraph, TanStack Query/Router, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-19-folded-spaces-design.md`

## Global Constraints

- Fold only above `FOLD_ABOVE = 300` people, never in focus mode or family tree mode.
- Near = you + 2 steps along `relationship` and `member` edges; `space` edges never count.
- Design tokens only; the banner is text and buttons (no hard-coded colours); bubbles take the space's colour from the palette.
- Show all lives in localStorage (key `folkbook.graph.showAll`), read and written in try/catch; blocked storage means "fold".
- No new dependency. Conventional commits, no AI attribution; tests, tsc, oxlint, prettier clean before each commit. One PR, "Closes #35".

## Review Focus

- **Everyone near** (a 400-person book where you're linked to everyone within 2 steps): no bubbles, no banner hint about folded spaces beyond the count. Test in Task 1.
- **A route through a folded space**: its people shown, the bubble's count down by them, the bubble gone when the route empties it. Test in Task 1.
- **A filter hides every near person linked into a bubble**: the bubble shows, unconnected; no line points at a missing node. Test in Task 2.
- **Storage blocked** (private window): Show all doesn't throw, folding stays on. Test in Task 2.
- **Clicking a bubble while a person is open beside the graph**: the peek stays on that person; the bubble unfolds; nothing tries to open a person called `fold:…`. Test in Task 3.

---

### Task 1: `fold.ts`

**Files:**
- Create: `frontend/src/features/graph/fold.ts`
- Test: `frontend/src/features/graph/fold.test.ts`

**Interfaces:**
- Consumes: `GraphData` from `graphModel.ts`.
- Produces:
  ```ts
  export const FOLD_ABOVE = 300
  export type SpaceRef = GraphData['nodes'][number]['spaces'][number]
  export type Bubble = { id: string; space: SpaceRef | null; count: number; direct: number }
  export type BubbleLine = { id: string; source: string; target: string; count: number }
  export type Folded = { graph: GraphData; bubbles: Bubble[]; lines: BubbleLine[]; shown: number; total: number }
  export const bubbleId = (spaceId: string | null) => `fold:${spaceId ?? 'none'}`
  export const isBubble = (id: string) => id.startsWith('fold:')
  export function foldGraph(graph: GraphData, options: { unfolded: ReadonlySet<string>; keep: ReadonlySet<string> }): Folded
  ```
  `unfolded` holds space ids, and `'none'` for "Not in any space". `graph` keeps the shown people and every edge between them (space edges included, as `toCanvas` filters them). Bubbles sorted by count, largest first; `direct` = near people with a line into the bubble. `BubbleLine.id` = `fold:<personId>:<bubble id>`.

- [ ] **Step 1: Failing tests** (a small builder of nodes and edges in the test):
  - near = me, 1 step and 2 steps along relationship and member edges; a 3-step person folds; a `space` edge from me doesn't make anyone near;
  - folded people grouped by their first space; no space → `fold:none`; counts; bubbles largest first;
  - lines: one per near person with drawn edges into a bubble, `count` = how many; `direct`;
  - a bubble nobody near links into: present, no lines;
  - `unfolded` with a space id: its people shown with their edges, other bubbles unchanged; `'none'` unfolds the no-space bubble;
  - `keep` (a route): kept people shown, bubble count reduced, a bubble emptied by it disappears;
  - everyone near: no bubbles; `shown` and `total`.
- [ ] **Step 2: Run, see them fail:** `npx vitest run src/features/graph/fold.test.ts`.
- [ ] **Step 3: Implement** (breadth-first from the `is_me` node, two levels).
- [ ] **Step 4: Run, see them pass;** typecheck, lint.
- [ ] **Step 5: Commit** `feat(graph): fold faraway people into bubbles by space`.

### Task 2: Drawing bubbles, and Show all on this device

**Files:**
- Modify: `frontend/src/features/graph/graphModel.ts` (`CanvasNode.size?`, `data.bubble`; `toCanvas(…, folds?: { bubbles: Bubble[]; lines: BubbleLine[] })`)
- Create: `frontend/src/features/graph/foldPreference.ts`
- Test: `frontend/src/features/graph/graphModel` tests in `Graph.test.tsx` (where `toCanvas` is tested), `foldPreference.test.ts`

**Interfaces:**
- Produces:
  - `toCanvas` adds one node per bubble: `label` "Climbing club · +212 more" ("Not in any space · +170 more"), `fill` the space's palette colour (`palette.noSpace` without), `size = Math.min(BUBBLE_MAX, BUBBLE_MIN + 2 * Math.sqrt(count))` with `BUBBLE_MIN = 14`, `BUBBLE_MAX = 40`, `data: { cluster: null, isMe: false, bubble: true }`; and one edge per bubble line whose person is drawn: dotted like a shared-space line (`dashArray` DOTS, `palette.sharedEdge`), `label` "via N" when N > 1.
  - `foldPreference.ts`: `export function useShowAll(): [boolean, (on: boolean) => void]`.
- [ ] **Step 1: Failing tests:** bubble node label, colour, size cap, not in a cluster; bubble lines dotted with "via 3", none for a filtered-out person (**a filter hides every linked-in person**: the bubble stays, no dangling line); `useShowAll` round-trips through localStorage, survives a remount, and with `localStorage.getItem` throwing returns `false` and doesn't throw on set (**storage blocked**).
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, see them pass;** typecheck, lint.
- [ ] **Step 5: Commit** `feat(graph): draw folded spaces, and remember Show all`.

### Task 3: Folding in the network

**Files:**
- Modify: `frontend/src/features/graph/GraphPage.tsx` (`NetworkView`): fold when `!focus && nodes > FOLD_ABOVE && !showAll`; `unfolded` state (+ the filter chips' spaces); route people as `keep`; banner; bubble click → unfold.
- Modify: `frontend/src/features/graph/NetworkCanvas.tsx`: `onPoint?: (nodeId: string | null) => void` (hovered node), for the banner's hint.
- Create: `frontend/src/features/graph/FoldBanner.tsx`.
- Modify: `docs/UI_FLOWS.md` §3.9, `docs/DECISIONS.md`.
- Test: `frontend/src/features/graph/Fold.test.tsx` (`renderApp('/graph')`, a generated 301-person graph).

**Interfaces:**
- Consumes: `foldGraph`, `isBubble`, `bubbleId`, `FOLD_ABOVE` (Task 1); `toCanvas(…, folds)`, `useShowAll` (Task 2).
- Produces: `FoldBanner({ shown, total, folded, hint, onShowAll })` with the spec's words: "You + 2 steps · 58 of 900 · faraway spaces are folded — click one to unfold" + **Show all 900**; hint "Unfold Climbing club · 212 people · you know 3 directly"; "Showing all 900" + **Fold faraway spaces**.

- [ ] **Step 1: Failing tests:** a 301-person graph shows the banner and a bubble node in the canvas list (the test canvas lists node labels); clicking the bubble (the fake canvas's node button) shows its people and doesn't open a peek (**while a person is open**: the peek stays on them); Show all shows everyone, and after a re-render from scratch (new `renderApp`) it's still all; Fold faraway spaces folds again; picking the space's chip unfolds it; `?focus=` never folds; a 300-person graph has no banner.
- [ ] **Step 2: Run, see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the whole suite**, typecheck, lint, format.
- [ ] **Step 5: Docs:** UI_FLOWS §3.9 gets the big-notebook flow (replacing "Later: folded space bubbles"); DECISIONS gets the 2-steps-along-lines rule and Show all per device.
- [ ] **Step 6: Commit** `feat(graph): fold faraway spaces in big notebooks`.

### Task 4: A real check, the PR

- [ ] **Step 1:** Deploy to wrath; generate ~900 people in a test account (spaces of 40–200, a few links into each from people near you); look at it on desktop (dark and light) and at phone size: bubbles, unfold, Show all, a route into a folded space, focus mode.
- [ ] **Step 2:** Fix anything found test-first; whole-branch review by a fresh reviewer; fix Critical/Important test-first.
- [ ] **Step 3:** PR "feat(graph): fold faraway spaces in big notebooks" with screenshots, "Closes #35".
