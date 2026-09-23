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
- **First run:** while a server has no users, anyone who opens it can create the first account, which becomes the admin. After that, the only way in is an invite.
- **Invite links:** expire after 1–30 days and allow 1–100 sign-ups. A link can also share a space (as viewer or editor), but only the space's owner can make one; it's deleted with the space. People who already have an account can use a space invite to join the space. Unknown, expired and used-up links all get the same answer, and tokens are long and random so links can't be guessed.
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
- **Sessions:** the app logs in with a session cookie. "Keep me logged in" never runs out while you use FolkBook: browsers cap cookies at 400 days, so the session is renewed for another 400 days whenever it's used. Without it, the session ends when the browser closes. Each session is listed as a signed-in device ("Firefox on macOS", IP, last seen) that can be signed out. Changing the password signs out every other device.
- **Passwords:** at least 8 characters, not only numbers, not a common password, not too close to the email.
- **Password guessing:** after 10 wrong passwords for an email within 15 minutes, logging in to that account is blocked until the window passes. Wrong email and wrong password get the same answer. Failed attempts older than the window are deleted as new ones come in, so no cleanup job is needed.
- Cookies are marked secure (HTTPS only) when `DJANGO_SECURE_COOKIES=true`; set it once FolkBook runs on a domain with HTTPS.
- Paths can cross shared spaces (Me → Defne → people in Defne's space).
- The graph connects people three ways: **stored links**; a space's owner and **the people they put in it**; a space's owner and **its members**. When a pair is connected several ways, the stored link describes it. "How do I know …?" returns the fewest-steps route (stored links win ties) plus up to two alternatives that start with a different first step.
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
- Derived family (`relationships/family.py`), always from the links the viewer can see:
  - **Siblings** share a parent. *Half-siblings* share one parent and each has another known parent; if a parent is unknown they're just siblings. *Step-siblings* are connected only through a step-parent or a parent's partner.
  - **Step-parents / step-children** come from stored step links, or from a parent's (or your) *current* partner. An ended partnership creates no step family.
  - **Grandparents / grandchildren, aunts / uncles** (incl. their current partners), **nieces / nephews** and **cousins** (children of aunts / uncles).
  - **In-laws:** your partner's parents and siblings, your siblings' partners, your children's partners. Through an ended partnership they're *former* in-laws.
  - A direct "other family" link that the stored parents now explain is shown once, as derived, with a pointer to the direct link so the app can offer to remove it.
  - Relation names are gender-neutral (parent, sibling, aunt/uncle).

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
- **Backend:** Django + Django Ninja (auto OpenAPI), PostgreSQL, no separate graph database. The graph (`graph/queries.py`) loads the viewer's visible network in 5 queries and walks it in Python: personal books are small enough, and every query stays inside the permission layer. Revisit with recursive SQL only if big books get slow.
- **Frontend:** Vite + React + TypeScript, Tailwind CSS + shadcn/ui, Motion, TanStack Query with a client generated from the OpenAPI spec, Reagraph for the graph (fallback: Sigma.js + graphology).
- **Infra:** Docker Compose, Caddy.
- Reagraph notes: `labelFontUrl` needs .ttf/.woff (not .woff2); `clusterAttribute` works only with force layouts; animation turns off above 400 nodes+edges; folded-space bubbles are synthetic nodes (not `collapsedNodeIds`).

## Monetization ideas
- Free, open-source self-hosted version.
- Paid managed hosting for people who don't want to run Docker.
- Possibly a paid supporter license or pro features.
