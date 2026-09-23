# AGENTS.md

Instructions for AI coding agents (and humans) working on FolkBook. Read this before changing code.

## What FolkBook is

A self-hosted personal CRM for keeping track of the people you know, with a graph of how everyone is connected. The headline feature is **remembering details about people**. It runs on the user's own server with Docker Compose; several users can share one server, each with a private book plus optional shared spaces.

## Sources of truth

| What | Where |
|---|---|
| Product decisions | `docs/DECISIONS.md` |
| Work items and priorities | [GitHub Issues](https://github.com/Thnorty/FolkBook/issues), grouped by milestone |
| Screens, flows, interaction ideas | `docs/UI_FLOWS.md` |
| Visual design (all screens, tokens, motion spec) | `design/FolkBook.dc.html` (exported from Claude Design; open in a browser) |
| How to run and develop | `README.md` |

If code and these documents disagree, ask before picking one. When a decision changes, update the document in the same change.

## Tech stack

- **Backend:** Django + Django Ninja (Pydantic schemas, auto-generated OpenAPI), PostgreSQL
- **Frontend:** Vite + React + TypeScript, Tailwind CSS + shadcn/ui, Motion, TanStack Query, Reagraph (graph), installable PWA
- **Infra:** Docker Compose, Caddy as reverse proxy
- **AI:** user-supplied key, Google Gemini or any OpenAI-compatible endpoint (incl. local models)

Don't add a new dependency when the stack or the standard library already covers the need. If a new dependency is justified, say why in the commit body.

## Core principles

### No repeated code
- Before writing something, search for an existing helper, component, hook, schema or service and reuse it.
- If the same logic appears a second time, extract it. Don't wait for a third copy.
- One source of truth per concept:
  - **API types:** the frontend uses the TypeScript client generated from the OpenAPI spec. Never hand-write request/response types that duplicate backend schemas.
  - **Business rules** (visibility, derived relations, permissions) live in the backend only. The frontend displays what the API returns; it never re-implements those rules.
  - **Design tokens** (colors, spacing, radii, fonts, durations) are defined once (Tailwind theme / CSS variables) and referenced everywhere. No hard-coded hex values or magic numbers in components.
  - **Strings shown to users** that appear in several places (e.g. privacy explanations) live in one place.
- Don't over-abstract either: extract real duplication, not code that merely looks similar today.

### Keep it simple and readable
- Small functions and components with one job. Clear names over comments; comments explain *why*, not *what*.
- Match the style of the surrounding code.
- No dead code, commented-out code or unused exports. Delete it; git remembers.
- No speculative features or config options nobody asked for.

## Privacy and security (non-negotiable)

These rules are the product. Breaking one is a critical bug.

- **Private per user, always:** notes, memory aids and interactions (timeline). Never shown to other users, even on shared people.
- **Shared spaces expose only:** basic profile (name, photo, birthday, tags) and that space's links. Contact details (phone, email) only when the space's "share contact details" toggle is on.
- **Relationships are visible only if the viewer can see the space the relationship belongs to.** Seeing both people is not enough.
- **Every person record has one owner.** Others see it by reference through shared spaces. Only the owner (or an editor of that space, for basic details) can change it.
- **All visibility checks go through one backend permission layer: `backend/access/policy.py`.** Never filter "by hand" inside a view. Every endpoint, search, graph query, export and API-key request uses the same layer: start from its `visible_*` querysets and ask its `can_*` checks before writing. New rules go there, with tests in `tests/access/`.
- **API keys:** stored hashed, shown once, scoped (read-only / read-write, limited spaces, optional private-notes access, off by default).
- **Secrets** (AI keys, SMTP passwords) are encrypted at rest and never logged, never returned by the API, never sent to the frontend after saving.
- Links in emails must never change data on a plain GET (email scanners open links); use a confirmation page.
- Validate all input on the backend. Never trust the client.

## Backend conventions

- Apps grouped by domain (e.g. `accounts`, `people`, `spaces`, `relationships`, `interactions`, `reminders`, `ai`, `api_keys`).
- Views/routers stay thin: parse input → call a service function → return a schema. Business logic lives in services, not in views, serializers or models' `save()`.
- Derived family relations (siblings, cousins, in-laws) are **computed, never stored**. Only parents, partners and "other family" direct links are stored.
- Every model change ships with a migration. Never edit a migration that has been committed; add a new one.
- Use the ORM; raw SQL only for things like recursive graph queries, kept in one module and covered by tests.
- Avoid N+1 queries (`select_related` / `prefetch_related`); list endpoints are paginated.
- **API layout:** each app has `api.py` (a Ninja `Router`, added in `config/api.py`), `schemas.py` (request/response schemas) and `services.py` (writes). Endpoints get their `Access` from `core.api.access_for(request)`.
- **API behavior:**
  - Something the user can't see is **404**, never 403, so its existence isn't revealed. Visible but not allowed is **403**; a clash with existing data is **409** (`core.api.Conflict`); invalid input is **422**.
  - Errors always look like `{"detail": ...}`.
  - Lists are paginated: `{"items": [...], "count": N}`, 50 per page. Their query count must not grow with the number of rows (there's a test for each list).
  - Order names with `core.db.by_name()` (ICU collation), never plain `order_by("name")`.
  - A schema field that must hide data (e.g. contact details) gets an explicit resolver that returns the filtered value.
  - When a static path segment sits next to a parameter (`/devices/sign-out-others` next to `/devices/{id}`), type the parameter (`{uuid:id}`) so the static path isn't swallowed.
- **Auth for the app:** session cookies. The frontend calls `GET /api/auth/csrf` once, then sends the `csrftoken` cookie's value as the `X-CSRFToken` header on every write (also on login). The token changes on login, so read it again afterwards.
- Timestamps in UTC; format dates for the user on the frontend.
- **Background jobs:** anything slow or scheduled (sending email, AI calls that don't need an answer right away, housekeeping) is a Django task: `@task` in `<app>/tasks.py`, enqueued from a service with `.enqueue()`. Periodic jobs go in `PERIODIC_JOBS` in `jobs/scheduler.py`. Jobs must be safe to run twice. Test them by calling `.call()`.
- Names are Unicode (Yılmaz, Şen, Ayşe). Search and sorting must handle this correctly.

## Frontend conventions

- TypeScript `strict`. No `any` unless unavoidable, and then explain why.
- Server state through TanStack Query hooks built on the generated API client. No ad-hoc `fetch` calls in components.
- **Routing:** TanStack Router, routes defined in code in `src/router.tsx`; links and params are type-checked. Logged-in pages are children of `appRoute`, whose guard sends you to `/login` (and back afterwards). Screens not built yet use `placeholder()`; replace the placeholder when you build the screen.
- **Layout:** `src/app/` is the shell: `AppLayout` (sidebar from `md` up, bottom tabs below), `CommandPalette`, and `nav.ts` with the sections and `SHORTCUTS`. Register a shortcut with `useShortcut`; show it with `<Kbd>`, which writes it the way the user's keyboard labels it. Pages start with `<PageHeader>`, which also names the browser tab.
- **Queries** live with their feature: `src/features/<resource>/queries.ts` (e.g. `spacesQuery`). Log in and out only through `logIn` / `logOut` in `src/api/session.ts`: they drop cached data so one account never sees another's.
- **API client** (`src/api/`): `api` from `client.ts` is typed from `schema.d.ts`, which `npm run api:generate` builds from the backend's OpenAPI spec. Never edit the generated files; regenerate and commit them with the backend change. The client adds the CSRF header and rejects every failed call with an `ApiError` (`status`, `detail`, a readable `message`). Write query options next to the feature with TanStack's `queryOptions` and `unwrap(api.GET(...))`; keys start with the resource (`['people', ...]`) so related queries can be invalidated together. A 401 anywhere clears the current user (`currentUserQuery`).
- Build every screen for **mobile and desktop** as designed (bottom tab bar on mobile, sidebar on desktop). Check both before calling a screen done.
- **Light and dark mode** ("notebook at night") for every screen, using the tokens.
- **Design tokens** live in `src/styles/tokens.css`: each color is written once as `light-dark(day, night)`, so dark mode needs no `dark:` classes. The theme follows the OS unless `<html data-theme="light|dark">` picks one. `src/index.css` maps the tokens to Tailwind (`bg-paper`, `text-ink-soft`, `shadow-note`, `rounded-card`…) and removes Tailwind's default palette and sizes, so only our tokens exist. Text uses the role utilities (`type-display`, `type-title`, `type-heading`, `type-body`, `type-small`, `type-label`, `type-meta`, `type-hand`) or the named sizes (`text-xs`…`text-2xl`). A new text/background pair gets a line in `src/styles/tokens.test.ts`, which checks WCAG AA in both themes.
- **Space colors:** put `data-space={color}` on an element; `bg-space`, `text-space-ink` and `text-on-space` then use that space's color.
- **Components:** restyled shadcn/ui primitives in `src/components/ui/` (Button, Input, Label, Toaster); notebook pieces in `src/components/notebook/` (PersonCard, Polaroid, SpaceTab/SpaceChip/SpaceRibbon, StickyNote, TimelineItem). Toasts: `notify()` from `src/lib/notify.tsx`. Merge classes with `cn()` from `src/lib/utils.ts`; when you add a theme name Tailwind doesn't know (a size, shadow or radius), register it there too.
- **Design system page:** `npm run dev`, then open `/design` to see every token and component in light and dark. It exists only in development; add new core components to it.
- **Accessibility:** semantic HTML, keyboard navigation, visible focus, labels on inputs, WCAG AA contrast.
- **Motion:** follow the motion spec in the design file (UI transitions ≤ 450ms, decorative ink/paper effects ≤ 700ms). Every animation has a reduced-motion fallback (simple fade) that respects both the OS setting and the in-app setting.
  - Durations and the ease live in `src/motion/tokens.ts` (the CSS copy `ease-notebook` is kept equal by a test). Animate with `m` components from `motion/react-m`: the app loads Motion lazily in strict mode, so `motion.div` throws.
  - Primitives in `src/motion/`: `<Shared id>` elements travel between screens (the "page turn"; person ids come from `sharedPerson` so a card and a profile always match), `<PageFade>` fades a page in, `<InkUnderline>` draws under something just saved.
  - Ask `useReducedMotion()` from `src/motion/` (it combines the device and the in-app setting); in CSS use the `reduced:` variant, not Tailwind's `motion-reduce:`. With reduced motion nothing moves or tilts; things fade in over 150ms (`REDUCED_TRANSITION`).
- **Appearance settings** (theme, reduced motion) belong to the device: `src/lib/appearance.ts` keeps them in localStorage and sets `data-theme` / `data-motion` on `<html>`. Read them with `useAppearance()`, change them with `setAppearance()`.
- Keyboard shortcuts: `N` add person, `Shift+N` quick capture, `Ctrl/Cmd+K` command palette. Show `Ctrl` on Windows/Linux and `⌘` on macOS.
- Components from shadcn/ui are restyled to the notebook design; don't ship default shadcn looks.

## Tests

Every change that adds or changes behavior comes with tests. A bug fix starts with a test that reproduces the bug.

- **Backend:** pytest + pytest-django, with factories for test data. Test services directly and every API endpoint (happy path, validation errors, permissions).
- **Privacy tests are mandatory** for anything that reads data: prove that another user, a non-member, a viewer vs. editor, and a scoped API key see exactly what they should, and nothing more.
- **Derived relations** (cousins, in-laws, former in-laws after a divorce, step/adoptive parents) get table-driven tests.
- **Frontend:** Vitest + Testing Library for components and hooks; test behavior the user sees, not implementation details.
- **End-to-end:** Playwright for the key flows (sign up via invite, add person, quick capture review, share a space, "How do I know…?").
- Tests are fast, independent and deterministic: no real network calls (mock AI providers and SMTP), no reliance on test order or the current date.
- All tests, linters and type checks must pass before committing. Never skip, delete or weaken a test to make it pass.

## Linting and formatting

- Python: Ruff (lint + format), type hints on public functions.
- TypeScript: oxlint + Prettier, `tsc -b` clean.
- Don't reformat files you aren't otherwise changing.

## Commands

Postgres must be running for backend tests: `docker compose up -d db`.

| Task | Command |
|---|---|
| Run the whole stack | `docker compose up --build -d` |
| Backend dev server | `cd backend && uv run --env-file ../.env python manage.py runserver` |
| Backend tests | `cd backend && uv run --env-file ../.env pytest` |
| Backend lint / format | `cd backend && uv run ruff check . && uv run ruff format --check .` |
| New migration | `cd backend && uv run --env-file ../.env python manage.py makemigrations` |
| Add a Python dependency | `cd backend && uv add <package>` (`--dev` for tooling) |
| Background worker (dev) | `cd backend && uv run --env-file ../.env python manage.py db_worker` |
| Scheduler (dev) | `cd backend && uv run --env-file ../.env python manage.py run_scheduler` |
| Frontend dev server | `cd frontend && npm run dev` |
| Frontend tests | `cd frontend && npm test` |
| Frontend checks | `cd frontend && npm run typecheck && npm run lint && npm run format:check` |
| Regenerate API types | `cd frontend && npm run api:generate` (after any API change) |

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

<body: what changed and why, wrapped at 72 characters>

<footer: issue references, BREAKING CHANGE notes>
```

- **Types:** `feat`, `fix`, `refactor`, `test`, `docs`, `style`, `perf`, `build`, `ci`, `chore`
- **Scope:** the area touched, e.g. `people`, `spaces`, `graph`, `api`, `auth`, `reminders`, `ai`, `ui`, `docker`
- **Summary:** imperative mood ("add", not "added"), lowercase, no trailing period, at most 72 characters
- **Body:** explain *why* when it isn't obvious. Mention new dependencies and migrations.
- One logical change per commit; code and its tests go in the same commit.
- **No AI attribution:** don't add `Co-Authored-By` lines, "Generated with …" lines or any other tool/agent signature to commits or pull requests.

Examples:

```
feat(spaces): let owners remove members from a shared space
fix(relationships): keep step-parents after a partner link ends
test(api): cover read-only API keys writing to a space
```

## Branches and pull requests

- Never commit directly to `main`. Branch names: `<type>/<short-description>`, e.g. `feat/quick-capture-review`.
- A PR describes what changed, why, and how it was tested; include screenshots (mobile + desktop, light + dark) for UI changes.
- Keep PRs focused; split large work into reviewable steps.

## Before you say you're done

- [ ] Tests added/updated and passing; linters and type checks clean
- [ ] No duplicated logic, types or tokens introduced
- [ ] Privacy rules respected and tested
- [ ] UI checked on mobile and desktop, light and dark, with reduced motion
- [ ] `docs/DECISIONS.md` / `docs/UI_FLOWS.md` updated if a decision or flow changed
- [ ] The commit or PR references its issue (`Closes #12`)
