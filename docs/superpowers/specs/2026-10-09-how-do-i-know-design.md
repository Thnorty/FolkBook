# "How do I know…?" and focus mode (#34)

## Goal

Show how you know someone: the route from your Me to them, drawn on the graph like a pen stroke and spelled out step by step, with other routes if there are any. Finish focus mode: a person's 1- or 2-step neighborhood, on desktop as well as phones.

## What exists

- `GET /api/graph/paths/{person_id}?alternatives=2`: the fewest-steps route from the viewer's Me (stored links win ties) and up to two alternatives that start with a different first step (`DECISIONS.md`). Built on `visible_graph(access)`, so only links and people the viewer can see.
- `GET /api/graph/neighborhood/{person_id}?hops=1|2`: a person and everyone within 1 or 2 steps.
- The graph page has focus mode only on the phone sheet (**Focus**, 1 step, "Show everyone"). Nothing calls the paths endpoint.

## Delivery

Two PRs:

1. **"How do I know…?"** (§1–§4): `former` on route steps, the shared person search, the route on the canvas, the picker, the summary, and the entry points.
2. **Focus mode finished** (§5). Closes #34.

## 1. Backend

- **No new endpoints and no new privacy rules.** Routes and neighborhoods already go through `access/policy.py`.
- **`former: bool` on each route step** (`HopOut`), from `Edge.is_former`, so an ended link reads "former partner".
- **Tests:** `former` on a step; a route never goes through a link in a space the viewer can't see, even when the viewer sees both people (add it if `tests/graph` doesn't cover it already).

## 2. State and the canvas

- **In the URL:** `/graph` takes typed search params:
  - `how=<person id>`: the route to that person is shown;
  - `focus=<person id>` and `hops=1|2` (default 1): focus mode.

  Only one at a time: starting one clears the other. Esc clears whichever is shown (through `useShortcut`, so an open dialog or menu gets Esc first).
- **Queries** under `['people', 'graph', …]`, so adding or removing someone or a link redraws them with the graph: `pathsQuery(personId)` next to `neighborhoodQuery`.
- **The route on the canvas** (`graphModel.ts`, plain data with direct tests):
  - The ink is built from the route's steps (from → to), not from the canvas's lines: a step through someone's space has no line today ("being in a space draws no line"). Where the canvas has a line between the two people it's drawn in ink; where it hasn't, an ink line is added for the route.
  - The route's people and lines are always drawn, even when a filter ("Family only", a space) would hide them. Filters still apply to everyone else.
  - Everyone and everything else is dimmed.
  - The view fits the route.
- **Motion:** the ink draws itself step by step (a decorative ink effect: at most 700 ms). With reduced motion it fades in over 150 ms.

## 3. Starting "How do I know…?"

- **The graph header** (screens 3f, 3i): a "How do I know…?" box. `/` focuses it on desktop (shown with `<Kbd>`). It searches with the server's search (Unicode names), like Connect. Picking someone sets `how`; the box then shows their name and ✕ (clears it). Your own Me is not offered.
- **The shared search:** `PersonPicker`'s search box and results list (`ConnectionForm.tsx`) become a shared `PersonSearch` in `features/people/`. Connect keeps its "Create “…” as a new person" row as an extra.
- **The peek panel (desktop) and the phone sheet:** "How do I know them?", next to Open profile and Focus. Not shown for your own Me.
- **A profile:** a small "How do I know {first name}?" link to `/graph?how=<id>`. Not on your own Me.

## 4. The summary

A card over the canvas on desktop (3f), a sheet from the bottom on phones (3g).

- **Heading:** "How you know Tom · 2 steps" ("1 step" for one).
- **The route, one step per line:** Me → *friend* → Defne Aydın → *met at Hackathon 2026* → Tom Bergqvist. A step reads like the graph's lines:
  - a stored link: its name (`linkLabel`), "former …" when it has ended;
  - two users who share a space: "shares Hackathon 2026";
  - someone in a person's space: "in Hackathon 2026".

  One helper words both the lines and the steps.
- **Why**, only when the person is someone else's: "Tom came into your book with Hackathon 2026, shared by Defne." From the person's owner and their spaces you can see (several are joined: "Hackathon 2026 and Climbing club"). Not for another user's own Me (Defne herself): the route already says "shares Hackathon 2026".
- **Other routes:** up to two lines, "Also via Emma Yılmaz: friend, then cousin", each with **Show**, which draws that route instead. While one is shown, "Back to the shortest" returns.
- **Open {first name}'s profile** · **Clear**.
- **No route** (someone in your book with no link and no shared space): "You haven't said how you know Anna yet." with **Connect…** (`openConnect`). Nothing is drawn.
- **Loading:** "Finding the way…".
- **Not visible any more** (404: deleted, or a stale link): "This person isn't in your book anymore." with Clear.

## 5. Focus mode (PR 2)

- **Desktop:** the peek panel gets **Focus**, like the phone sheet.
- **The focus bar** (3h, 3i): "← Back to everyone" (also Esc) · "Focused on Emma Yılmaz" · a **1 step / 2 steps** switch (`hops`).
- **The count line:** "8 direct · 5 more at 2 steps · 135 others hidden" ("· 5 more at 2 steps" only with 2 steps). Counted from the neighborhood and the whole graph the page already has.
- **Nobody connected:** just them, and "Nobody else is connected to Emma yet." instead of the count line.
- **Not visible any more:** the same message as §4, with Back to everyone.
- **No double-click to refocus** (UI_FLOWS removed double-click on purpose): select someone, then Focus.

## Words

"Steps", never "hops", everywhere a person reads it.

## Docs

`docs/UI_FLOWS.md` §3.9: both flows as built; "How do I know…?" leaves the "Later" line.

## Tests

- **Backend:** `former` on steps; no route through a link in a space the viewer can't see.
- **`graphModel`:** ink over an existing line; an added ink line for a step through a space; filters never hide the route; the rest dimmed; step wording; the "why" line.
- **The page (PR 1):** pick someone → summary and route; Show an alternative and back; Clear; Esc; `/`; no route with Connect…; 404; the peek panel, phone sheet and profile entry points; starting a route clears focus; Connect still works with `PersonSearch`.
- **The page (PR 2):** Focus from the peek panel; 1 / 2 steps; the count line; nobody connected; Back and Esc; starting focus clears a route.
- **In the real app** (each PR; a throwaway database where Tom is in Defne's shared space; Chrome via Playwright, desktop light and phone dark, and reduced motion): a route through the shared space, an alternative, someone with no route, 2-step focus.
