# End-to-end tests for the key flows (#132)

## Goal

Committed browser tests that click through FolkBook's key flows the way a person would, against the real backend and the real built frontend, and fail CI when a flow breaks. They replace the one-off check scripts as the lasting check. AGENTS.md already asks for them ("Playwright for the key flows").

## Scope

- The setup: Playwright, a test database with known accounts, a CI job, docs.
- Tests for the key flows that exist: sign up via invite, add a person, share a space.
- Later flows add their own test in their own PR: "How do I know…?" (#34), quick capture review (#32).

## 1. How it runs

- **Playwright** (`@playwright/test`) as a dev dependency in `frontend/`. Tests in `frontend/e2e/*.spec.ts`, config in `frontend/playwright.config.ts`, run with `npm run e2e`. Vitest skips `e2e/`. Chromium only.
- **The app under test,** started by Playwright (`webServer`), never reusing a running server:
  - the backend: `e2e_reset`, then `runserver` on **:8010**, with `POSTGRES_DB=folkbook_e2e`;
  - the frontend: the built bundle (`vite build`, then `vite preview` on **:4180**), passing `/api` to the backend. The proxy's target comes from `FOLKBOOK_API` (default `http://localhost:8000`, as now), so the dev server is unchanged.

  Separate ports and database: running the tests never touches the dev server or the dev book.
- **Screen sizes:** two Playwright projects, `desktop` (1280×900) and `phone` (390×844, touch). Every test runs in both.
- **Failures** keep a trace (screens, network, console): `trace: 'retain-on-failure'`. No retries locally; one retry in CI, and a test that only passes on retry is reported as flaky.

## 2. Test data

- **`manage.py e2e_reset`** (`backend/core/management/commands/`):
  - refuses (exits with an error, changes nothing) unless the database name ends in `_e2e`;
  - creates that database if it's missing (connecting to the `postgres` maintenance database), then migrates;
  - empties it (`flush`) and creates the known accounts: **Ela Yılmaz** (`ela@e2e.test`, admin) and **Deniz Kaya** (`deniz@e2e.test`, member), each with their Me, and the test password from `E2E_PASSWORD` (default `e2e-pass-123`, only ever for this database).
  - Covered by pytest: the refusal, and the accounts it makes.
- **Tests run one at a time** (`workers: 1`) on that one reset per run, and each uses its own names ("Greta 4821", a unique email), so their order doesn't matter.
- **Logging in:** a setup project logs Ela and Deniz in through the real login page and saves their sessions (`e2e/.auth/`, git-ignored). Tests start logged in as whoever they need; the invite test's newcomer starts logged out.

## 3. The tests

Found the way a person finds things: by role and accessible name (`getByRole`, `getByLabel`), no CSS selectors, no test-only hooks, no fixed waits.

1. **Sign up via invite** (`invite.spec.ts`): Ela, in Settings → Invite links, creates a link and reads it from the page. A new logged-out browser opens it, fills in Your name, Email (unique) and Password, and signs up. They're in the app as themselves, and their book holds only their own Me: nothing of Ela's.
2. **Add a person** (`add-person.spec.ts`): Ela adds "Greta ####" with "+ Add person", with how they met. Greta's profile shows it; after a reload she's in People.
3. **Share a space** (`share-space.spec.ts`): Ela creates a space, puts Greta in it, writes a note on Greta, and shares the space with Deniz from the share dialog. As Deniz: the space and Greta are there; Ela's note is not.

## 4. CI

A fourth job, `e2e`, on every PR and push to main, in parallel with the others:

- Postgres 18 as a service with `POSTGRES_DB=folkbook_e2e`;
- `uv sync --locked` (backend), `npm ci` (frontend);
- Chromium with its system dependencies (`npx playwright install --with-deps chromium`), cached by Playwright's version;
- `npm run e2e` (it builds the frontend itself);
- on failure, the Playwright report and traces uploaded as an artifact.

## 5. Docs

- **README:** "End-to-end tests": `docker compose up -d db`, then `cd frontend && npm run e2e`; `npx playwright show-trace` / `show-report` for a failure; the ports and database it uses.
- **AGENTS.md:** `npm run e2e` in the commands table; the Tests section says how they run (real stack, `folkbook_e2e`, known accounts) and that each new key flow adds its test in the same PR.

## Tests of the setup itself

- pytest for `e2e_reset` (refuses another database; makes the accounts).
- The three specs pass in both projects locally and in CI.
- Each spec fails when its flow is broken: checked once by hand while building it (e.g. a wrong label), not kept.
