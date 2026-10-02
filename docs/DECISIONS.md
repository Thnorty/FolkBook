# FolkBook — Decisions

What we decided and why it matters. Work items live in [GitHub Issues](https://github.com/Thnorty/FolkBook/issues) (grouped by milestone). When a decision changes, update this file in the same change.

## Product
- Personal CRM for keeping track of the people you know: relatives, friends, school/work contacts, people met at events.
- Headline feature: **remembering details about people** (memory aids, notes).
- A product for other people, with a way to make money (still open, see issue "Decide how FolkBook makes money").
- AI only **suggests** people and links; the user edits suggestions before confirming. Users bring their own key: Google Gemini or any OpenAI-compatible endpoint (incl. local models).
- Contact import via .vcf files only. No voice input.
- Reminders go out **by email only** (plus Today cards in the app). Self-hosters configure their own SMTP; the paid hosted version sends email for them. Memory aids are included in emails by default, with a setting to turn that off.
- **Keep-in-touch nudges:** someone is due once the days since your latest timeline entry about them reach their interval (their own, or your default). Logging anything resets it; a snooze waits until its date; "stop" never nudges. Someone you've never talked to counts from when you set an interval for them, or when they came into your book. The default interval is empty for new users, so nobody is nudged until you choose to be; nudges can also be turned off entirely. Today asks with the device's own date, so "due today" follows the user's time zone.

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
- **Admins** list the server's users, make reset links, make others admins and deactivate accounts (Settings → Users). A deactivated user is signed out everywhere and can't log in; their book stays and returns if they're reactivated. Admins can't change their own rights or deactivate themselves, so a server always keeps the admin doing the change.
- **Password reset links:** until the server sends email (#37), an admin makes a one-time reset link for someone who forgot their password (Settings → Users) and hands it over. It lasts 24 hours, a newer link replaces older ones, only a hash of the token is stored, and opening the link changes nothing (email scanners). Saving the new password signs the user out on every device. The log-in page says "Ask your admin for a reset link".
- **Password guessing:** after 10 wrong passwords for an email within 15 minutes, logging in to that account is blocked until the window passes. Wrong email and wrong password get the same answer. Failed attempts older than the window are deleted as new ones come in, so no cleanup job is needed.
- Cookies are marked secure (HTTPS only) when `DJANGO_SECURE_COOKIES=true`; set it once FolkBook runs on a domain with HTTPS.
- Paths can cross shared spaces (Me → Defne → people in Defne's space).
- The graph connects people three ways: **stored links**; a space's owner and **the people they put in it**; a space's owner and **its members**. When a pair is connected several ways, the stored link describes it. "How do I know …?" returns the fewest-steps route (stored links win ties) plus up to two alternatives that start with a different first step.
- Everyone who can see a space sees the Me of its owner and of every member.
- A link is shown only when the viewer can see its space **and** both people. A link inside a space can only be made between people in that space.
- **Pronouns** (she / he / they, optional, never required) are part of the basic profile. They only change what relations are called ("sister", "father-in-law"); the family is worked out without them, and partners stay "partner".
- Only the owner deletes a person. Editors of a space can fix the basic details of people in it, but nobody edits another user's Me.
- **Deleting someone** hides them from everyone at once (the permission layer skips deleted people). The owner can undo for a minute; the app offers Undo for 10 seconds and the rest is slack for a slow connection. A job that runs every minute then deletes them for good, with the owner's notes, memory aids, timeline entries and links about them. Other users who wrote about them keep a copy (see **Access ending**).
- **Removing someone shared with you** (you can't delete what isn't yours) hides them for you only: they're gone from your lists, search, graph and links, and nobody else is affected. Your own notes, memory aids, timeline and links about them are **kept, out of sight**, not deleted (design 2t said deleted): that way Undo and "Add back" on the space page bring everything back. Anyone you don't own can be removed this way, including another member's Me.
- A person can only be added to a space if their **owner takes part in that space** (owns it or is a member). Nobody can pass someone else's people on to users the owner never shared them with.
- Private data about someone you can no longer see is hidden; when you lose sight of someone you wrote about, you keep a copy instead (below).
- **Access ending.** A member can leave a space; its owner can remove a member, stop sharing (remove every member at once) or delete it. Someone can also be taken out of a space or deleted by their owner. Whenever that makes you lose sight of a person you wrote **notes, memory aids or timeline entries** about, you get a **kept copy**: a person in your own book with the basic profile as you could see it (contact details only if the space shared them), marked "kept" with whose book and which space they came from. What you wrote moves to the copy, and so do your keep-in-touch settings. Nobody else sees the copy, and the owner never learns who was kept.
  - Your **private links** follow to the copies; private links to people you didn't keep are removed. Links you made **inside a space** you no longer see stay with the space: they pass to its owner (or become private links of yours when the owner can't see both people).
  - Leaving or being removed takes **your own people** out of that space too: a person can only be in a space their owner takes part in. Other members who wrote about them keep copies.
  - Leaving shows first who you'd keep ("1 note · 2 memory aids") and how many others go. The owner deletes a space rather than leaving it.
  - When someone else's change ended your access, Today shows a card ("Defne stopped sharing Hackathon 2026. You kept 3 people you had notes on.") until dismissed, plus a toast once per device. For a single person taken out or deleted, there's a card only if you kept a copy.
  - Being added back later doesn't merge anything: the shared person and your kept copy are then both in your book.
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
- **Profile photos** are cropped to the same 4:5 polaroid in the browser (so any photo the browser can open works, HEIC included), then re-encoded on the server as WebP (800×1000 and a 240×300 thumbnail). Re-encoding drops EXIF data such as where the photo was taken. Photos are never public files: `/api/people/{id}/photo` checks that you can see the person, so a photo is visible exactly where the person is. Owners and space editors can change it (it's part of the basic profile). Files live in the `media_data` volume.
- **People search** matches every word you type against names, how you met, work, tags, the spaces you can see, and your own notes and memory aids (never anyone else's). It ignores case and accents (Postgres `unaccent`), so "yilmaz" finds Yılmaz.
- Visual direction: **warm notebook** (see `design/FolkBook.dc.html` and `docs/UI_FLOWS.md`).
- Profile on desktop: peek side panel from lists/graph + expand to full page. Mobile: always full page.
- Graph default: everyone for small notebooks (~300 people or fewer); otherwise Me + 2 hops with other spaces folded into bubbles.
- Keyboard: `N` add person, `Shift+N` quick capture, `Ctrl/Cmd+K` command palette.
- **App icon:** a notebook page with two space tabs on the ink-blue square (concept A). Sources are `frontend/public/icons/icon.svg` (rounded, for browsers and desktops) and `icon-maskable.svg` (full bleed with the notebook inside the safe circle, for Android and iOS); `npm run icons` renders the PNGs.
- **Installable, but no offline data:** FolkBook installs as an app (manifest + service worker). The service worker only keeps an "offline" page and the icon; it never caches the app's data or API responses, so nothing about people is stored on the device. Offline editing is out of scope (the server is the notebook).
- **Appearance is per device:** light / dark / system and reduce motion are saved in the browser, not the account, like the OS settings they override. A phone can be dark while the laptop is light.
- **Fonts are self-hosted** (Fontsource packages bundled into the app, with Latin Extended for Turkish and other names): opening a private notebook never contacts Google Fonts.
- **Contrast beats the mockups:** every text/background pair meets WCAG AA in both themes (checked by `src/styles/tokens.test.ts`). The design colors that fell short were shifted as little as possible, keeping their hue: faint ink in light mode #8D8579 → #6F685F; light sage tab text #4F5E40 → #4D5C3F; light sage #7D8F6A → #697859 and ochre #B0762A → #9B6825 (white chip text); night plum #8A6E9C → #9379A3, teal #52877F → #558C84, slate #6782A6 → #6A84A8 (dark tab text). Input borders are 50% ink (not 22%) so fields stand out at 3:1. Text on the page is checked against paper with its grain, which darkens it slightly.

## Tech stack
- **Backend:** Django + Django Ninja (auto OpenAPI), PostgreSQL, no separate graph database. The graph (`graph/queries.py`) loads the viewer's visible network in 5 queries and walks it in Python: personal books are small enough, and every query stays inside the permission layer. Revisit with recursive SQL only if big books get slow.
- **Frontend:** Vite + React + TypeScript, Tailwind CSS + shadcn/ui, Motion, TanStack Query with a client generated from the OpenAPI spec, Reagraph for the graph (fallback: Sigma.js + graphology).
- **Infra:** Docker Compose, Caddy.
- **Background jobs:** Django's built-in tasks API (`@task`, `.enqueue()`), stored in Postgres by `django-tasks-db`. A `worker` container runs them; a `scheduler` container enqueues periodic jobs (e.g. daily housekeeping, later the reminder digests) from `jobs/scheduler.py`. No Redis or Celery: two extra containers from the same image. Chosen over Celery (needs Redis plus a beat process) and Procrastinate (fine, but its own API instead of Django's standard one).
- Reagraph notes: `labelFontUrl` needs .ttf/.woff (not .woff2); `clusterAttribute` works only with force layouts; animation turns off above 400 nodes+edges; folded-space bubbles are synthetic nodes (not `collapsedNodeIds`).

## License
- **AGPL-3.0-or-later** (`LICENSE`). Anyone may use, change and self-host FolkBook; whoever runs a modified version as a service must publish their changes, so nobody can sell a closed hosted copy. As the copyright holder, the author can still run the paid hosted version.
- Outside contributions arrive under the AGPL too, so they couldn't be relicensed later without each contributor's permission. If dual licensing ever matters, ask contributors to agree to that (a CLA) before merging.

## Monetization ideas
- Free, open-source self-hosted version.
- Paid managed hosting for people who don't want to run Docker.
- Possibly a paid supporter license or pro features.
