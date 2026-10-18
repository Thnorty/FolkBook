# Family tree mode (#36) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A family tree view in Graph: one person's family by generation, with relation words, in-law and former-partner toggles, and "Add parent" slots.

**Architecture:** The backend walks the viewer's visible family links from the root (`relationships/tree.py`, plain data, beside `family.py`) and answers `GET /api/graph/family-tree/{id}` with people (generation, relation chain, flags, missing parents) and links. The frontend lays it out with a pure function (`treeLayout.ts`) and draws it with SVG lines behind HTML buttons (`FamilyTree.tsx`), as a mode of the Graph page (`?tree=<id>`).

**Tech Stack:** Django + Django Ninja, pytest; React + TypeScript, TanStack Query/Router, Tailwind tokens, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-18-family-tree-design.md`

## Global Constraints

- Every read goes through `access/policy.py` (`visible_people`, `visible_relationships`); a person the viewer can't see is 404; path ids are typed (`{uuid:person_id}`).
- Relation words live only in `frontend/src/features/person/labels.ts`; the backend sends codes.
- No new dependencies. No hard-coded colors or sizes: design tokens only (`bg-paper`, `text-ink-soft`, `border-line`…); new text/background pairs get a line in `src/styles/tokens.test.ts`.
- Animations: none for the tree's placement ("appears in place"); `useReducedMotion()` respected for any pan/zoom easing.
- Two PRs: Tasks 1–3 on `feat/family-tree` (backend, "1 of 2"), merged when CI is green; Tasks 4–7 on a new branch from `main` (frontend, "2 of 2", closes #36). Don't stack the second PR on the first's branch: deleting that branch closes it.
- Conventional commits, no AI attribution; all tests, ruff, tsc, oxlint, prettier clean before each commit.

## Review Focus

- **More than two parents** (biological + adoptive + step): `missing_parents` is 0, never negative, and all of them sit in the parents row. Test in Task 2.
- **Data that loops** ("A parent B" and "B parent A", or partners recorded as parent and child): the walk ends, every person appears once, layout terminates. Tests in Tasks 1 and 4.
- **A partner who is also blood family** (cousins who married): appears once, not flagged in-law. Test in Task 1.
- **A parent hidden by a toggle** (a step-parent's or ex-partner's child shown while that parent is filtered out): the child's line comes from the parent still shown; nothing points at a missing node. Test in Task 4.
- **A wide row** (12 siblings with partners): no overlaps, and Fit brings all of it into view. Test in Task 4.

---

## PR 1 of 2: backend (branch `feat/family-tree`)

### Task 1: The walk — who is in the tree, flags and generation

**Files:**
- Create: `backend/relationships/tree.py`
- Create: `backend/tests/relationships/specs.py` (the `"A parent B"` spec parser, moved out of `test_family.py`)
- Modify: `backend/tests/relationships/test_family.py` (import the parser from `specs.py`)
- Test: `backend/tests/relationships/test_tree.py`

**Interfaces:**
- Consumes: `relationships.family.Link`, `PersonId`, `RelationshipType`, `ParentType`.
- Produces:
  - `tests/relationships/specs.py`: `links(*specs: str) -> list[Link]` (same syntax as today: `"A parent B"`, `"parent:step"`, `"parent:adoptive"`, `"partner:former"`, direct `"A sibling B"`, `"A cousin B"`, `"A grandparent B"`, `"A aunt_uncle B"`); `test_family.graph()` becomes `FamilyGraph(links(*specs))`.
  - `tree.py`:
    ```python
    @dataclass(frozen=True)
    class TreePerson:
        person: PersonId
        generation: int            # root 0, parents +1, children -1
        in_law: bool
        via_former: bool
        relation: tuple["Step", ...] = ()   # filled in Task 2
        missing_parents: int = 0            # filled in Task 2

    def walk(links: Iterable[Link], root: PersonId) -> list[TreePerson]
    ```
    The root is included (generation 0, no flags). Sorted by (generation descending, str(person)).

- [ ] **Step 1: Move the spec parser** to `tests/relationships/specs.py` as `links()`; `test_family.py` imports it. Run `uv run --env-file ../.env pytest tests/relationships -q` → all pass (pure refactor).

- [ ] **Step 2: Write the failing tests** in `test_tree.py`, table-driven on Ela's family (`ELA` in `test_family.py`, imported) and small specs. A helper `summary(people) -> dict[name, (generation, in_law, via_former)]`.
  - `test_elas_tree`: root Ela →
    `Orhan (2,F,F)`, `Leyla (2,F,F)`, `Murat (1,F,F)`, `Nilgün (1,F,F)`, `Hakan (1,F,F)` (step-father, stored parent:step), `Selim (1,F,F)` (direct sibling of Murat), `Sevgi (1,F,F)`, `Aylin (0,F,F)` (cousin via Selim), `Can (0,F,F)`, `Mateo (0,F,F)` (root's partner), `Zeynep (0,T,F)` (brother's partner), `Kemal (1,T,F)` (aunt's partner), `Emir (-1,F,F)`, `Lina (-1,F,F)`, `Rosa (1,T,F)` (partner's parent), `Diego (0,T,F)` (partner's direct sibling), `Ela (0,F,F)`.
  - `test_rules` (parametrized, each `(specs, root, expected_summary)`):
    - a step-parent's other child is a step-sibling, not in-law: `"M parent R"`, `"S partner M"`, `"S parent X"` → `X (0,F,F)`.
    - in-laws stop after one partnership: `"R partner P"`, `"Q parent P"`, `"Q partner Z"`, `"Y parent Z"` → `P`, `Q (1,T,F)`, `Z (1,T,F)`, no `Y`.
    - a sibling's partner's family never comes in: `"M parent R"`, `"M parent B"`, `"B partner W"`, `"V parent W"` → `W (0,T,F)`, no `V`.
    - an ex and their family are `via_former`: `"R partner:former X"`, `"Y parent X"` → `X (0,F,T)`, `Y (1,T,T)`.
    - divorced parents are both plain blood: `"M parent R"`, `"F parent R"`, `"M partner:former F"` → `M`, `F` both `(1,F,F)`.
    - a former step-parent is `via_former`: `"M parent R"`, `"S partner:former M"` → `S (1,F,T)`.
    - great-grandparents at any distance: chain of 4 parent links up → generation 4.
    - direct links set generations: `"G grandparent R"` → `G (2,F,F)`; `"A aunt_uncle R"` → `A (1,F,F)`; `"R aunt_uncle N"` → `N (-1,F,F)`.
    - cousins who married appear once and blood: `"G parent M"`, `"G parent F"`, `"M parent R"`, `"F parent C"`, `"R partner C"` → `C (0,F,F)`.
    - a loop ends: `"A parent B"`, `"B parent A"` with root `A` → `{A: (0,F,F), B: (-1,F,F)}`.
    - someone with no family → only the root.

- [ ] **Step 3: Run them to see them fail.** `uv run --env-file ../.env pytest tests/relationships/test_tree.py -q` → ImportError / FAIL.

- [ ] **Step 4: Implement `walk()`.** A best-first search over `(person, kind)` states with key `(via_former, in_law, distance, kind_rank)` (`heapq`); a person is fixed the first time they're popped and only expanded from that state. Kinds and their moves (parent/child = stored parent links either way; direct = sibling, cousin, grandparent, aunt_uncle; partner = partner links, `via_former` set when the link `is_former`, and inherited):

  | kind (rank) | parent / child / direct | partner |
  |---|---|---|
  | `root` (0), `line` (0: an ancestor reached only by upward parent moves) | → `line` going up from root/line, else `blood` | root → `root_partner`; line → `step` |
  | `blood` (1) | → `blood` | → `leaf` (in_law) |
  | `root_partner` (2) | → `partner_family` (in_law) | → `leaf` (in_law) |
  | `step` (3) | children only → `step_child` | → `leaf` (in_law) |
  | `step_child` (4), `partner_family` (5) | step_child: none; partner_family → `partner_family` | → `leaf` (in_law) |
  | `leaf` (6) | none | none |

  Generation: parent +1, child −1, partner 0, sibling/cousin 0, grandparent ±2, aunt_uncle ±1 (by link direction). Keep each fixed state's predecessor and the link used (Task 2 needs the route).

- [ ] **Step 5: Run the tests** → PASS. Also `uv run ruff check . && uv run ruff format --check .`.

- [ ] **Step 6: Commit** `feat(relationships): walk a family tree from one person` (body: the reach rules, refs #36).

### Task 2: Relation chains and missing parents

**Files:**
- Modify: `backend/relationships/tree.py`
- Test: `backend/tests/relationships/test_tree.py`

**Interfaces:**
- Consumes: `walk()` (Task 1), `FamilyGraph.relations_of()`, `Relation`.
- Produces:
  ```python
  RELATIVE = "relative"
  MAX_STEPS = 3

  @dataclass(frozen=True)
  class Step:
      person: PersonId   # whose relation it is (the frontend uses their pronouns)
      relation: str      # a Relation value, or RELATIVE
      parent_type: str = ""
      former: bool = False
  ```
  `walk()` now fills `TreePerson.relation` and `TreePerson.missing_parents` (`max(0, 2 - visible parents)` for the root and `line` people, 0 for the rest).

- [ ] **Step 1: Write the failing tests.** Helper `words(person) -> list[str]` = `[f"{s.relation}" + (":former" if s.former else "") for s in person.relation]`.
  - `test_named_relations_match_the_profile`: on `ELA`, every person `FamilyGraph(links(*ELA)).relations_of("Ela")` names has a one-step chain equal to that relation (e.g. `Zeynep → ["sibling_in_law"]`, `Hakan → ["parent"]` with `parent_type == "step"`, `Rosa → ["parent_in_law"]`).
  - `test_chains` (parametrized):
    - grandmother's cousin: `"G parent P"`, `"P parent R"`, `"G cousin X"` → `X: ["grandparent", "cousin"]`, first step's `person == "G"`.
    - cousin's partner: `"G parent A"`, `"G parent B"`, `"A parent R"`, `"B parent C"`, `"C partner W"` → `W: ["cousin", "partner"]`.
    - great-grandparent: `"GG parent G"`, `"G parent P"`, `"P parent R"` → `GG: ["grandparent", "parent"]`.
    - past three steps it's `relative`: `"GG parent G"`, `"G parent P"`, `"P parent R"`, `"GG cousin X"`, `"X partner Y"` → `Y: ["relative"]` (it would take grandparent, parent, cousin, partner), and `X: ["grandparent", "parent", "cousin"]`.
    - former in-law: `"R partner:former X"`, `"Y parent X"` → `Y: ["parent_in_law:former"]`.
  - `test_missing_parents`: root with one parent → root 1, that parent (no parents) 2, a grandparent with two parents 0; siblings, partners, children 0; three parents (biological, adoptive, step) → 0.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement.** Per person, the chain comes from their route (Task 1's predecessors): if `relations_of(root)` names them, one `Step`; else take the last person `m` on the route that the current anchor's `relations_of` names, add that step, make `m` the anchor and repeat; stop with `(Step(person, RELATIVE),)` when it would pass `MAX_STEPS`. Cache `relations_of` per anchor. A named relation's `parent_type` and `former` go on its step.

- [ ] **Step 4: Run the tests** → PASS, ruff clean.

- [ ] **Step 5: Commit** `feat(relationships): name everyone in a family tree`.

### Task 3: The endpoint, privacy, docs

**Files:**
- Modify: `backend/relationships/family.py` (extract `visible_family_links(access, *, ending=None) -> list[Link]`, used by `family_of` and the tree)
- Modify: `backend/access/policy.py` (add `can_link_privately(access: Access) -> bool` = `not access.read_only and not access.is_space_limited`; `can_create_relationship` uses it for `space is None`)
- Modify: `backend/relationships/tree.py` (add `family_tree(access, person) -> FamilyTree`)
- Modify: `backend/graph/schemas.py`, `backend/graph/api.py`
- Modify: `frontend/src/api/schema.d.ts` (regenerated: `cd frontend && npm run api:generate`)
- Modify: `docs/DECISIONS.md` (the tree's reach and in-law rule, next to the derived-relations decision)
- Test: `backend/tests/graph/test_family_tree.py`, `backend/tests/access/test_reads.py` (privacy cases)

**Interfaces:**
- Consumes: `walk()`, `Step`, `TreePerson` (Tasks 1–2).
- Produces:
  ```python
  @dataclass(frozen=True)
  class FamilyTree:
      root: Person
      people: list[tuple[Person, TreePerson]]
      links: list[Relationship]
  def family_tree(access: Access, person: Person) -> FamilyTree
  ```
  `GET /api/graph/family-tree/{uuid:person_id}` → `FamilyTreeOut`:
  ```python
  class TreeStepOut(Schema): relation: str; pronouns: Pronouns | None; parent_type: str; former: bool
  class TreePersonOut(Schema):
      id: UUID; name: str; photo_url: str | None; is_me: bool; pronouns: Pronouns | None
      generation: int; relation: list[TreeStepOut]; in_law: bool; via_former: bool; missing_parents: int
  class TreeLinkOut(Schema): id: UUID; type: str; source: UUID; target: UUID; parent_type: str; former: bool
  class FamilyTreeOut(Schema): root: UUID; people: list[TreePersonOut]; links: list[TreeLinkOut]
  ```
  `source`/`target` are `person_a`/`person_b` ("source is the parent of target" for parent links). Empty pronouns become `None`. `photo_url` as in `_graph_out` (`photo_of(person)["thumbnail_url"]`). `missing_parents` is 0 unless `can_link_privately(access)`.

- [ ] **Step 1: Write the failing endpoint tests** in `tests/graph/test_family_tree.py` (factories, `api`, `world`):
  - `test_a_small_family`: Ela's Emma with parents and a partner → names, generations, one-step relations, links with `source`/`target`/`parent_type`, root `is_me` false and Ela's own Me `is_me` true when she's in it, `pronouns` passed through on steps.
  - `test_people_you_cannot_see_are_not_found` (Defne's private Jin) and `test_a_malformed_id_is_not_found` (`/graph/family-tree/abc` → 404).
  - `test_the_tree_query_count_does_not_grow`: as in `test_graph_query_count_does_not_grow_with_the_book`, adding 15 children with parent links.
- [ ] **Step 2: Write the failing privacy tests** in `tests/access/test_reads.py`, following its style:
  - another user's private people and links never appear in Ela's tree;
  - a parent link inside a space the viewer isn't in doesn't join the families (Kaan, a viewer of the climbing club, doesn't see a link Ela keeps privately between Oskar and Emma);
  - a viewer (Kaan) and an editor (Deniz) of the climbing club both get the space's family links and both get `missing_parents`;
  - a read-only API key and a space-limited API key: only what they may see, `missing_parents` all 0.
- [ ] **Step 3: Run them** → FAIL (404 route missing).
- [ ] **Step 4: Implement** `visible_family_links`, `can_link_privately`, `family_tree` (a fixed number of queries: the links, then `visible_people(access).in_bulk(...)`; drop any id not visible), the schemas and the thin route. Run `uv run --env-file ../.env pytest tests/test_routing.py tests/api_keys -q` too (the route is under `/api/graph`, already in `TAKES_KEYS`).
- [ ] **Step 5: Run everything:** `uv run --env-file ../.env pytest -q` → all pass; ruff clean. Regenerate types: `cd frontend && npm run api:generate && npm run typecheck`.
- [ ] **Step 6: DECISIONS:** add the family tree's reach (everyone linked by family; in-laws at most one partnership away; ex-partners and who's reached only through them behind "Former partners"; relation chains up to three steps, then "relative").
- [ ] **Step 7: Commit** `feat(graph): family tree endpoint` (body: the endpoint, the policy helper, regenerated types; refs #36). Push, open PR "feat(graph): family tree, backend (1 of 2)", merge when CI is green, delete the branch, `git checkout main && git pull`.

---

## PR 2 of 2: frontend (branch `feat/family-tree-ui` from `main`)

### Task 4: Relation words and the layout

**Files:**
- Modify: `frontend/src/features/person/labels.ts`
- Create: `frontend/src/features/graph/treeLayout.ts`
- Test: `frontend/src/features/person/labels.test.ts` (or the existing labels test file), `frontend/src/features/graph/treeLayout.test.ts`

**Interfaces:**
- Consumes: `components['schemas']['FamilyTreeOut' | 'TreePersonOut' | 'TreeStepOut' | 'TreeLinkOut']`.
- Produces:
  - `labels.ts`: `type TreeStep = components['schemas']['TreeStepOut']`; `relationChainLabel(steps: TreeStep[]): string`: each step through `relationLabel(step.relation, step.pronouns)`, joined with `"'s "`; "former " in front when the last step is former; `[]` → `''`.
  - `treeLayout.ts`:
    ```ts
    export type TreeData = components['schemas']['FamilyTreeOut']
    export type TreePerson = components['schemas']['TreePersonOut']
    export type TreeToggles = { formerPartners: boolean; inLaws: boolean }
    export type PlacedPerson = { person: TreePerson; x: number; y: number }
    export type PlacedSlot = { childId: string; childName: string; x: number; y: number; key: string }
    export type TreeLine = {
      id: string
      kind: 'partner' | 'child' | 'other' | 'slot'
      points: [number, number][]
      label?: 'partner' | 'former' | 'adopted' | 'step'
      dashed: boolean   // former partners, slots
      dotted: boolean   // direct "other family" links
    }
    export type TreeRow = { generation: number; y: number; label: string }
    export type TreeLayout = {
      people: PlacedPerson[]; slots: PlacedSlot[]; lines: TreeLine[]; rows: TreeRow[]
      width: number; height: number; up: number; down: number
    }
    export const NODE_WIDTH = 120
    export const ROW_HEIGHT = 140
    export function shownPeople(data: TreeData, toggles: TreeToggles): TreePerson[]
    export function rowLabel(generation: number, rootName: string, rootIsMe: boolean): string
    export function layoutTree(data: TreeData, toggles: TreeToggles): TreeLayout
    ```

- [ ] **Step 1: Write the failing tests.**
  - `relationChainLabel`: `[grandparent she, cousin he]` → `"grandmother's cousin"`; no pronouns → `"grandparent's cousin"`; `[sibling_in_law she, former]` → `"former sister-in-law"`; `[relative]` → `"relative"`.
  - `rowLabel`: 2 → "Grandparents", 1 → "Parents", 0 → "Your generation" (me) / "Nilgün's generation" (first name), −1 "Children", −2 "Grandchildren", 3 "Great-grandparents", −3 "Great-grandchildren", 4 "4 generations up", −4 "4 generations down".
  - `shownPeople`: `inLaws: false` drops `in_law`; `formerPartners: false` drops `via_former`.
  - `layoutTree` on a fixture of Ela's family (the API shape, written once in `treeLayout.test.ts` and reused by Task 6's tests):
    - every shown person placed once; rows sorted top-down by generation; `up`/`down` = 2/1 for the 3k family;
    - no two people in a row closer than `NODE_WIDTH`;
    - partners next to each other (no one between them);
    - each child's x within the span of its parents' row ± one `NODE_WIDTH` when the row has room;
    - a "child" line starts at the couple's midpoint when both parents are shown, at the single parent otherwise (**a parent hidden by a toggle**: a second small fixture where the root's ex-partner `X` is `via_former` and is the other parent of the root's child; with `formerPartners: false` the child's line starts at the root and no line refers to `X`);
    - labels: adoptive → `adopted`, step → `step`, former partner → `former` + `dashed`; direct sibling link → `dotted`;
    - slots: one `PlacedSlot` per missing parent, in the row above, `childName` set;
    - the same input twice gives deep-equal layouts;
    - **a wide row**: 12 siblings, each with a partner → no overlaps, `width >= 24 * NODE_WIDTH`;
    - **data that loops**: people whose links disagree with their generations still place, and the function returns.
- [ ] **Step 2: Run them to see them fail:** `npx vitest run src/features/graph/treeLayout.test.ts src/features/person` → FAIL.
- [ ] **Step 3: Implement.** Units = a person plus their shown partners. Order units within rows by 4 sweeps (down: average x of parents' units; up: average x of children's units), ties by name, the root's unit first placed at x 0; then pack each row left to right at `NODE_WIDTH` spacing and shift a parent unit over its children's midpoint when that doesn't overlap. Slots are extra units in the row above, next to the person's shown parents. Translate everything so the minimum x and y are 0.
- [ ] **Step 4: Run them** → PASS; `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(graph): lay out a family tree`.

### Task 5: Drawing the tree

**Files:**
- Create: `frontend/src/features/graph/FamilyTree.tsx`
- Modify: `frontend/src/styles/tokens.test.ts` (only if a new text/background pair is used)
- Test: `frontend/src/features/graph/FamilyTree.test.tsx`

**Interfaces:**
- Consumes: `layoutTree`, `TreeData`, `TreeToggles`, `rowLabel` (Task 4), `relationChainLabel`, `initials()` from `@/lib/names`.
- Produces:
  ```ts
  type FamilyTreeProps = {
    data: TreeData
    toggles: TreeToggles
    selected: string | null
    onSelect: (personId: string) => void
    onAddParent: (personId: string) => void
  }
  export function FamilyTree(props: FamilyTreeProps): JSX.Element
  ```
  Fills its parent; owns pan, zoom and its own + / − / Fit buttons and the legend.

- [ ] **Step 1: Write the failing tests** (render `FamilyTree` directly with the Task 4 fixture):
  - each shown person is a button named "Name, relation words" (`"Leyla Demir, grandmother"`), the root "Ela Demir, Me" when `is_me`; clicking calls `onSelect(id)`; `selected` sets `aria-pressed`;
  - each slot is a button "Add parent of Nilgün Aksoy"; clicking calls `onAddParent(nilgünId)`;
  - row labels are shown ("Grandparents", "Your generation");
  - the legend lists "parent · partner", "former", "missing — click to add", "step · adoptive";
  - buttons "Zoom in", "Zoom out", "Fit" exist and change the transform's scale (read from the container's `style.transform`).
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement.** One container with `transform: translate(x, y) scale(s)` (s clamped 0.3–2), pointer-drag pans, wheel zooms around the pointer; Fit on mount and when `data.root` changes, using the container's size. SVG under the HTML; partner lines solid or `stroke-dasharray`, dotted lines for `dotted`, labels on lines in `type-meta`. Faces: photo (`photo_url`) or `initials(name)` in a circle (`bg-card`, `border-line-strong`; the root larger with `border-accent`); name `type-small font-medium`, relation `type-meta text-ink-soft`. Slots: dashed circle with `+`, "Add parent" / "of Nilgün". Rows: a faint rule and the label at the left, `type-meta`. Colors from tokens only.
- [ ] **Step 4: Run them** → PASS; typecheck, lint, format.
- [ ] **Step 5: Commit** `feat(graph): draw the family tree`.

### Task 6: Tree mode in Graph, the profile link

**Files:**
- Modify: `frontend/src/features/graph/search.ts` (+ its test): `GraphSearch.tree?: string`; precedence how > tree > focus; each clears the others.
- Modify: `frontend/src/features/graph/queries.ts`: `familyTreeQuery(personId)`, key `['people', 'graph', 'tree', personId]`.
- Create: `frontend/src/features/graph/NodeSheet.tsx` (moved out of `GraphPage.tsx`, its Focus button becoming a `primary: { label: string; onClick: () => void }` prop).
- Create: `frontend/src/features/graph/ModeSwitch.tsx`: "Network" / "Family tree" (phones: "Tree") buttons with `aria-pressed`.
- Create: `frontend/src/features/graph/FamilyTreeView.tsx`: the whole tree mode page.
- Modify: `frontend/src/features/graph/GraphPage.tsx`: render `<FamilyTreeView>` when `tree` is set; add `ModeSwitch` to the network header; use `NodeSheet` from its file.
- Modify: `frontend/src/features/person/ConnectionsSection.tsx`: "View family tree" link (`to="/graph" search={{ tree: personId }}`) under the Family rows.
- Modify: `docs/UI_FLOWS.md` §3.10 (the final flow, as in the spec's "The page").
- Test: `frontend/src/features/graph/FamilyTreeView.test.tsx`, `search.test.ts`, `ConnectionsSection` test file for the link.

**Interfaces:**
- Consumes: `FamilyTree` (Task 5), `familyTreeQuery`, `PeekPanel`, `NodeSheet`, `PersonSearch`, `HowDoIKnow`, `Toggle`, `useConnectionForm().openConnect(personId, 'parent')`, `useShortcut(SHORTCUTS.back, …)`, `PERSON_GONE`.
- Produces: `export function FamilyTreeView({ rootId }: { rootId: string })`.

- [ ] **Step 1: Write the failing tests** (`renderApp('/graph?tree=…')` with `fakeServer`, the Task 4 fixture as the API answer):
  - `search.test.ts`: `?tree=x` → `{ tree: 'x' }` with how/focus/hops undefined; `?how=y&tree=x` → how wins; `?tree=x&focus=z` → tree wins.
  - the switch: on `/graph`, "Family tree" goes to `?tree=<my Me id>`; with a person open in the peek, to their tree; "Network" drops `tree`;
  - the header: "Tree of" shows the root's name; picking someone in it changes `?tree=`; "Family · N people" with N = shown people; "2 generations up · 1 down";
  - toggles: "In-laws" off hides Zeynep, "Former partners" off hides the via-former person; both on by default;
  - the network's filter bar ("Family only") isn't there in tree mode;
  - picking someone in "How do I know…?" from tree mode goes to the network with `?how=` (tree gone);
  - clicking a person opens the peek with **Show their tree** (re-roots: `?tree=` changes) and How do I know them?;
  - a slot opens the connection dialog with "Parent" chosen (`getByRole('radio', { name: 'Parent' })` checked);
  - Esc goes back to the network (`tree` gone), after an open peek closed first;
  - states: only the root → "No family linked to Anna yet." with **Connect…**; 404 → "This person isn't in your book anymore."; pending → "Drawing the tree…";
  - profile: a person with family rows shows "View family tree" linking to `/graph?tree=<id>`.
- [ ] **Step 2: Run them to see them fail.**
- [ ] **Step 3: Implement** the files above; GraphPage only branches and shows the switch (it must not grow by more than the switch and the branch).
- [ ] **Step 4: Run them, then the whole suite:** `npm test`, `npm run typecheck && npm run lint && npm run format:check` → all pass.
- [ ] **Step 5: UI_FLOWS §3.10** rewritten to the final flow.
- [ ] **Step 6: Commit** `feat(graph): family tree mode in the graph` (refs #36).

### Task 7: End-to-end, a real check, the PR

**Files:**
- Create: `frontend/e2e/family-tree.spec.ts`

**Interfaces:**
- Consumes: `e2e/fixtures.ts` (`test`, `expect`, `addPerson`, `submitButton`), `unique()`, the `connect()` pattern from `how-do-i-know.spec.ts` (move it to `fixtures.ts` if it's now used twice).

- [ ] **Step 1: Write the test:** Ela adds `unique('Lina')`, connects Ela as her parent (Connect dialog, "Parent"/"Child" chip so Ela is Lina's parent), opens Lina's profile → **View family tree** → the tree shows Lina and Ela in "Parents" → **Add parent of Lina** → creates `unique('Mateo')` in the dialog → Mateo appears as a button in the tree, in the "Parents" row. Desktop and phone (the config runs both).
- [ ] **Step 2: Run** `npm run e2e -- family-tree` (Postgres up) → PASS at both sizes.
- [ ] **Step 3: Check by hand** on desktop and phone width, light and dark, reduced motion; deploy the branch to wrath (as for #143) and look at a real-sized family: pan, zoom, Fit, toggles, slots.
- [ ] **Step 4: Commit** `test(graph): family tree end-to-end`; push; PR "feat(graph): family tree (2 of 2)" with screenshots (mobile + desktop, light + dark), "Closes #36".
