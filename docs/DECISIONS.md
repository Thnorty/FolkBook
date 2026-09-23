# FolkBook — Decisions

What we decided and why it matters. Work items live in [GitHub Issues](https://github.com/Thnorty/FolkBook/issues) (grouped by milestone). When a decision changes, update this file in the same change.

## Product
- Personal CRM for keeping track of the people you know: relatives, friends, school/work contacts, people met at events.
- Headline feature: **remembering details about people** (memory aids, notes).
- A product for other people, with a way to make money (still open, see issue "Decide how FolkBook makes money").
- AI only **suggests** people and links; the user edits suggestions before confirming. Users bring their own key: Google Gemini or any OpenAI-compatible endpoint (incl. local models).
- Contact import via .vcf files only. No voice input.
- Reminders go out **by email only** (plus Today cards in the app). Self-hosters configure their own SMTP; the paid hosted version sends email for them. Memory aids are included in emails by default, with a setting to turn that off.

## Hosting
- **Self-hosted**, not local-first: the app needs a connection to the user's server; no offline mode.
- Shipped as Docker Compose: Postgres, Django backend, Caddy serving the frontend (automatic HTTPS).
- Responsive web app for mobile and desktop, installable as a PWA.

## Users and spaces
- Several users per server, **invite-only**. Admins create invite links; members can create links for spaces they own.
- **Spaces** are groups of people (the old "contexts" merged into them). A person can be in many spaces. A space is private until shared.
- Being **in** a space (as a person) is separate from having **access** to it (as a user). Access roles: owner / editor / viewer.
- Every person record has **one owner**. Other users see it by reference through shared spaces (always the owner's latest version).
- Sharing a space shows only its people's **basic profile** (name, photo, birthday, tags) and that space's links. **Contact details** (phone, email) only if the space's toggle is on (off by default).
- **Private per user, always:** notes, memory aids and interactions (timeline), even on shared people.
- A relationship has an owner and a space; it's visible only if the viewer can see **that** space.
- When access ends (unshared, left, removed), the user keeps copies of the people they wrote notes on.
- Each user has one **"Me"** node, shown in the graph and in every space they're a member of. It's a normal person record linked to the account (`user.me`), created together with the user; the user's name, photo and birthday live there, not on the account.
- Accounts log in with **email** (case-insensitive, stored lowercase). Server admins are users with `is_staff`.
- Records exposed by the API use **UUID** primary keys, so IDs can't be guessed or counted.
- Paths can cross shared spaces (Me → Defne → people in Defne's space).
- Everyone who can see a space sees the Me of its owner and of every member.
- A link is shown only when the viewer can see its space **and** both people. A link inside a space can only be made between people in that space.
- Only the owner deletes a person. Editors of a space can fix the basic details of people in it, but nobody edits another user's Me.
- A person can only be added to a space if their **owner takes part in that space** (owns it or is a member). Nobody can pass someone else's people on to users the owner never shared them with.
- Private data about someone you can no longer see is hidden (kept copies come with #31).
- Narrowed access (for API keys) can be limited to some spaces, exclude private data, or be read-only. With a space limit, only people in those spaces are visible, and private links are hidden.

## Relationships
- Stored family links: **parent** (biological / adoptive / step) and **partner**. Siblings, cousins, grandparents, in-laws are **derived**, never stored, relative to the viewer's "Me".
- **"Other family"** direct links (sibling, cousin, grandparent, grandchild, aunt/uncle, niece/nephew) are allowed when the connecting people are unknown; they're superseded once the chain can be derived.
- Ending a relationship (e.g. divorce) keeps it as **former**; derived in-laws move to a Former group. Parent links never end. A former partner can become a current partner again.
- Directional links (parent, grandparent, aunt/uncle) read "A is the … of B". Symmetric links (partner, sibling, cousin, social) are stored once, lowest id first, so the same link can't exist twice.
- A relationship without a space is visible only to its owner.

## Data details
- Birthdays store day, month and an optional year (the year is often unknown).
- Each user keeps **one** notes text per person, any number of memory aids, and their own timeline.
- Space names are unique per owner (ignoring case); colors can repeat.
- Deleting a space never deletes people or links; links in it become private to their owner.

## API
- API-first: the frontend uses the same API users get.
- Personal API keys: shown once, stored hashed, expiry, revocable; scopes read-only / read-write, limited to chosen spaces; access to private notes, memory aids and timeline is **opt-in per key** (off by default).

## UI
- Visual direction: **warm notebook** (see `design/FolkBook.dc.html` and `docs/UI_FLOWS.md`).
- Profile on desktop: peek side panel from lists/graph + expand to full page. Mobile: always full page.
- Graph default: everyone for small notebooks (~300 people or fewer); otherwise Me + 2 hops with other spaces folded into bubbles.
- Keyboard: `N` add person, `Shift+N` quick capture, `Ctrl/Cmd+K` command palette.

## Tech stack
- **Backend:** Django + Django Ninja (auto OpenAPI), PostgreSQL (graph queries in recursive SQL, no separate graph DB).
- **Frontend:** Vite + React + TypeScript, Tailwind CSS + shadcn/ui, Motion, TanStack Query with a client generated from the OpenAPI spec, Reagraph for the graph (fallback: Sigma.js + graphology).
- **Infra:** Docker Compose, Caddy.
- Reagraph notes: `labelFontUrl` needs .ttf/.woff (not .woff2); `clusterAttribute` works only with force layouts; animation turns off above 400 nodes+edges; folded-space bubbles are synthetic nodes (not `collapsedNodeIds`).

## Monetization ideas
- Free, open-source self-hosted version.
- Paid managed hosting for people who don't want to run Docker.
- Possibly a paid supporter license or pro features.
