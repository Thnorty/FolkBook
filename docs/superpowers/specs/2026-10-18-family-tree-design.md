# Family tree mode (#36) — design

The Graph gets a second view next to the network: a family tree of one person, one row per generation, partners side by side, with a relation word under every name and empty "Add parent" slots for missing parents.

Design screens: 3k (desktop), 3l (mobile). Flow: UI_FLOWS §3.10.

## Steps

1. **Backend:** who is in a tree, their generation and relation, `GET /api/graph/family-tree/{uuid:person_id}`, regenerated API types, DECISIONS.
2. **Frontend:** the layout, the drawing, the Graph page's switch, Tree of… picker and toggles, the slots, the profile link, UI_FLOWS §3.10. Closes #36.

## Decisions

### Who is in a tree

The tree of a person (the *root*) is everyone linked to them by family, walked outward through the family links the viewer can see:

- **Always:** anyone reached through parent and child links, at any distance (any parent type: biological, adoptive, step), and through direct "other family" links (sibling, cousin, grandparent, aunt/uncle); the root's own partners; the partners of the root's parents and ancestors (step-parents, a grandparent's partner) and their children (step-siblings).
- **In-laws** (`in_law`): the partners of anyone else in the tree, and the blood family of the root's own partners (parents, siblings and onwards through parent links). The walk crosses at most one partnership that isn't the root's or an ancestor's: a sister-in-law's own family never comes in.
- **Former partners** (`via_former`): anyone reached only through a partnership that ended: an ex-partner, their family, a former step-parent. Two people who are both in the tree for other reasons (parents who divorced) stay, joined by a dashed line.
- The answer carries everyone with their flags; the toggles only filter, so switching them is instant and needs no request.

### Generation

- The root is 0. A parent is +1, a child −1, a partner the same row. Direct links: sibling and cousin 0, grandparent +2 (grandchild −2), aunt/uncle +1 (niece/nephew −1).
- Breadth-first from the root: a person's generation (and their relation, below) comes from the shortest route. Data that disagrees (a loop, someone recorded as parent and partner) can't break it: the first route found wins and every line is still drawn.

### Relation words

- If the existing derivation (`FamilyGraph.relations_of`) names the person for the root, that relation is used, so the tree and the profile's Family section always agree (grandparent, cousin, sibling-in-law, step-parent, former partner…).
- Further out, the relation is a **chain** built along the route: the last person on it that the derivation names for the root, then what the next person is to them, and so on; at most 3 steps (`[grandparent, cousin]` → "grandmother's cousin"). Past 3 steps it is `relative`.
- Each step carries the relation code and that step's person's pronouns. The frontend turns the chain into words with the existing `relationLabel()` (`labels.ts` stays the one place for relation words): "grandmother's cousin", or "grandparent's cousin" without pronouns.

### The API

`GET /api/graph/family-tree/{uuid:person_id}` in the graph router (API keys allowed, like the rest of `/api/graph`). A person the viewer can't see is 404.

```
{
  "root": "<id>",
  "people": [
    {
      "id", "name", "photo_url", "is_me", "pronouns",
      "generation": 1,
      "relation": [{"relation": "parent", "pronouns": "he", "parent_type": "biological", "former": false}],
      "in_law": false,
      "via_former": false,
      "missing_parents": 0
    }
  ],
  "links": [{"id", "type", "source", "target", "parent_type", "former"}]
}
```

- `relation` is empty for the root.
- `links` are the stored family links between people in the tree (parent, partner, and direct "other family" links), as the viewer can see them.
- `missing_parents` (0–2) is set only for the root and the root's ancestors, counting the parent links the viewer can see, and only when the viewer may add a private link to that person (`can_create_relationship` with no space; a read-only or space-limited API key can't). It is 0 for everyone else.
- Everything comes from `visible_people` and `visible_relationships` (`access/policy.py`): a link in a space the viewer can't see never joins two families. The walk runs in Python on the loaded links (`relationships/tree.py`, next to `family.py`, reusing `FamilyGraph`); a fixed number of queries whatever the tree's size.

### Layout (frontend)

A pure function, `features/graph/treeLayout.ts`, from the API answer plus the two toggles to positions and line geometry; no React.

- **Rows:** one per generation, highest on top. Labels relative to the root: Great-grandparents, Grandparents, Parents, "Your generation" (or "Nilgün's generation" for someone else's tree), Children, Grandchildren, Great-grandchildren; further out "3 generations up" / "3 generations down".
- **Units:** a person and their partners shown in the tree form one unit and stay side by side.
- **Order:** units in each row are ordered by a few sweeps down and up the tree, each placing a unit at the average position of its parents (going down) or children (going up), ties broken by name. The root's unit starts in the middle. The same data always gives the same layout.
- **Placement:** fixed spacing, no overlaps; parents are centred over their children where there's room.
- **Slots:** "Add parent" slots sit in the row above their person, next to that person's known parents.

### Drawing

`features/graph/FamilyTree.tsx`: one container that pans and zooms (a CSS transform), an SVG for the lines behind HTML for the people.

- Partner line: horizontal, "partner" on it; ended ones dashed, "former".
- Child lines: from the couple's midpoint (or the single parent) to each child, as in 3k; an adoptive or step parent link says "adopted" / "step" on its line.
- Direct "other family" links: a dotted line between the two people.
- People: the face used elsewhere (photo or initials), the name, the relation words. The root larger, "Me" when it's the viewer.
- Slots: a dashed circle with "+", "Add parent" / "of Nilgün", joined to the person.
- Pan by dragging, zoom with the wheel or a pinch, + / − / Fit buttons. The tree fits itself into view when it opens and when the root changes; it appears in place, without animation. With reduced motion nothing moves.
- Legend bottom left (parent · partner, former, missing — click to add, step · adoptive).
- Colors and sizes from the design tokens only; any new text/background pair gets a line in `tokens.test.ts`.

### The page

- **Switch:** "Network / Family tree" in the Graph header ("Network / Tree" on phones). The tree is `/graph?tree=<personId>`; like `?how=` and `?focus=` it replaces the others, and Network drops it. From the network, the switch opens the tree of the person open in the peek panel, else your own.
- **From a profile:** **View family tree** under Connections → Family opens `/graph?tree=<their id>`.
- **Header in tree mode:** **Tree of** a picker (the people search "How do I know…?" uses) that re-roots the tree; **Former partners** and **In-laws** toggles (`Toggle`), both on by default; "Family · 13 people" beside the title; "2 generations up · 1 down" above the tree, counted from what's shown. The network's filter bar is hidden. "How do I know…?" stays and switches to the network with the route.
- **A person:** opens the network's peek panel (desktop) or bottom sheet (phones); its *Focus* becomes **Show their tree** (re-roots). Open profile, How do I know them?, Log stay.
- **A slot:** `openConnect(personId, 'parent')`, the existing connection dialog with "parent" chosen. Saving refreshes the tree.
- **Esc** goes back to the network, after an open peek has closed.
- **No family yet:** "No family linked to Anna yet." with their two slots and **Connect…**. Someone no longer in the book: "This person isn't in your book anymore." Loading: "Drawing the tree…". Errors in the app's words, like the rest of the graph.

## Testing

- **Walk (plain data, table-driven):** who is in the tree and their flags (blood at any distance, the root's partners, step-parents and step-siblings, in-laws one partnership away and never two, former partners and who is reached only through them); generations, with direct "other family" links and data that disagrees; chains at 1, 2 and 3 steps, then `relative`; `missing_parents` only for the root and ancestors.
- **Endpoint:** the answer for a small family; 404 for someone not visible and for a malformed id; query count flat as the tree grows.
- **Privacy:** another user's private people never appear; a link in a space the viewer isn't in doesn't join families; a viewer and an editor of a shared space see the same tree (links only from spaces they can see) and both get slots; a read-only and a space-limited API key see only what they may, without slots.
- **Layout (plain data):** no overlaps; partners adjacent; parents above their children; row labels; the same layout twice.
- **Page:** the switch and the URL; Tree of… re-roots; the toggles hide and show flagged people; people and slots are buttons with readable names ("Add parent of Nilgün"); Show their tree; a slot opens the connection dialog with parent chosen; Esc back to the network; the empty and gone states.
- **End-to-end:** open a tree from a profile, add a parent through a slot, see them in the parents row (desktop and phone).
- Checked by hand on desktop and phone, light and dark, with reduced motion, and on a real server with a real-sized family.
