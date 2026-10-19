# Folded space bubbles for big notebooks (#35) — design

A big notebook's network starts with you and the people within two steps; everyone further away is folded into one bubble per space ("Climbing club · +212 more"), which unfolds on click. Small notebooks are unchanged.

Design screen: 3j. Decision: DECISIONS ("Graph default: everyone for small notebooks (~300 people or fewer); otherwise Me + 2 hops with other spaces folded into bubbles").

Frontend only: `GET /api/graph` already sends every visible person and line.

## Decisions

### When it folds

- When the graph has **more than 300 people** (`FOLD_ABOVE = 300`), unless this device chose **Show all**.
- Never in focus mode (`?focus=`): it shows its own 1–2 steps already. Never in family tree mode.

### Who is near

- You, and everyone within **2 steps along drawn lines**: stored links (relationships) and the faint lines between users who share a space (`kind: member`). The invisible "a space's owner knows the people in it" edges (`kind: space`) don't count: being in a space isn't a step.
- The filters (Family only, Hide former) don't change who is near; they apply to what's drawn afterwards, as today.

### Bubbles

- Everyone not near is folded by **their first space** (the one that colours them today); people in no space fold into **"Not in any space"**.
- A bubble is a synthetic node: id `fold:<space id>` (`fold:none` for no space), label "Climbing club · +212 more", the space's colour (the no-space colour for "Not in any space"), and a size that grows with its count (Reagraph's `size`, capped so a huge bubble doesn't swallow the view).
- **Lines into a bubble:** one faint line (the shared-space line style) from each near person who has at least one drawn line to someone inside it, labelled "via N" when N > 1 of their lines lead in. No lines between bubbles.
- A bubble with nobody linked to anyone near still shows, unconnected.
- **Hover** (desktop): the line words show as for people, and the banner's hint becomes "Unfold Climbing club · 212 people · you know 3 directly" (3 = near people with lines into it).

### Unfolding

- **Clicking (or tapping) a bubble** shows all of that space's folded people, with every drawn line between shown people; the other bubbles stay. Unfolded spaces are page state: they reset on the next visit.
- **Picking spaces in the filter chips** shows everyone in them, whatever their first space, while they're picked (choosing a space is asking to see it); the other spaces' bubbles hide, like their people.
- **A route** ("How do I know…?"): its people are always shown, taken out of their bubble's count; the rest of that space stays folded.
- **Show all N** (in the banner) turns folding off. It's remembered **on this device** (localStorage, `features/graph/foldPreference.ts`; unreadable or blocked storage means "fold"), and **Fold faraway spaces** turns it back on.

### The banner

Over the graph, under the filters (3j):
- folded: "You + 2 steps · 58 of 900 · faraway spaces are folded — click one to unfold" and **Show all 900**;
- hovering a bubble: "Unfold Climbing club · 212 people · you know 3 directly";
- showing all (in a big notebook): "Showing all 900" and **Fold faraway spaces**;
- nothing for a notebook of 300 or fewer.

### Code

- **`features/graph/fold.ts`** (plain data, no React): `foldGraph(graph, { meId, unfolded, keep })` → `{ graph, bubbles, near, total }`. It returns a `GraphData`-shaped graph of the shown people and lines plus the bubble nodes and their lines, so `toCanvas()` draws it as before, and `bubbles` (`{ id, space, count, direct }`) for the banner and clicks.
- **`toCanvas()`** learns bubble nodes: their size, colour and label; clusters ignore them.
- **`GraphPage` (`NetworkView`)**: decides whether to fold, keeps the unfolded spaces, turns a click on `fold:…` into an unfold instead of the peek, and shows the banner.

## Testing

- **`fold.ts`, table-driven:** the 2-step rule (relationship and member lines count, space edges don't); grouping by first space and "Not in any space"; counts; "via N" lines and who gets them; an unconnected bubble; unfolding one space (its people and lines appear, others stay); route people kept and out of the count; nothing folded at 300 people, folded at 301.
- **Page:** a 301-person graph shows the banner and bubbles; clicking a bubble unfolds it (its people appear, the peek doesn't open); Show all shows everyone and is remembered after a reload, Fold faraway spaces folds again; a space chip unfolds that space; focus mode never folds; a small notebook has no banner.
- Checked by hand on desktop and phone, light and dark, on a real server with a generated notebook of ~900 people.
- **Docs:** UI_FLOWS §3.9 (big notebooks), DECISIONS (the 2-steps-along-lines rule and what's remembered).
