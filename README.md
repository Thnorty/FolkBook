# FolkBook

A self-hosted personal CRM for keeping track of the people you know: relatives, friends, people from school, work and events. It helps you remember the small details about people and shows how everyone is connected in a graph.

> Status: early development. Nothing to use yet.

## Run it

Requirements: Docker with Docker Compose.

```bash
cp .env.example .env
```

Edit `.env` and replace every `change-me`, then:

```bash
docker compose up --build -d
```

FolkBook is now at <http://localhost:8080> (or the `FOLKBOOK_PORT` you set). The API docs are at `/api/docs`.

Until the first-run setup screen exists, create the admin account from the command line:

```bash
docker compose exec backend python manage.py createsuperuser
```

For a real server, set `SITE_ADDRESS` to your domain (e.g. `folk.example.com`) and Caddy gets an HTTPS certificate automatically. Also set `DJANGO_SECURE_COOKIES=true`, and add your domain to `DJANGO_ALLOWED_HOSTS` and `DJANGO_CSRF_TRUSTED_ORIGINS` (e.g. `https://folk.example.com`). Use `docker compose -f compose.yaml up -d` there so the development overrides aren't applied.

## Develop

Requirements: Docker, [uv](https://docs.astral.sh/uv/), Node.js 22.

The fastest loop runs only Postgres in Docker, and the backend and frontend locally with hot reload:

```bash
docker compose up -d db
```

```bash
cd backend && uv run --env-file ../.env python manage.py runserver
```

```bash
cd frontend && npm install && npm run dev
```

Open <http://localhost:5173>. Vite forwards `/api` to the backend on port 8000.

Background jobs (emails, reminders, housekeeping) need the worker, and periodic ones the scheduler. Run them when you work on jobs, or use `docker compose up -d worker scheduler`:

```bash
cd backend && uv run --env-file ../.env python manage.py db_worker
```

```bash
cd backend && uv run --env-file ../.env python manage.py run_scheduler
```

### Design system

With the frontend dev server running, open <http://localhost:5173/design> to see the colors, type and core components in light and dark mode. The page exists only in development.

### API types

The frontend's API types are generated from the backend. After changing an endpoint or schema, regenerate them and commit both files (`frontend/openapi.json` and `frontend/src/api/schema.d.ts`); a backend test and a CI check fail until you do:

```bash
cd frontend && npm run api:generate
```

### Checks

Backend (Postgres must be running):

```bash
cd backend && uv run --env-file ../.env pytest && uv run ruff check . && uv run ruff format --check .
```

Frontend:

```bash
cd frontend && npm test && npm run typecheck && npm run lint && npm run format:check && npm run api:check
```

## Project layout

| Path | What |
|---|---|
| `backend/` | Django + Django Ninja API |
| `frontend/` | Vite + React + TypeScript app |
| `caddy/` | Web server: serves the frontend, proxies the API, handles HTTPS |
| `compose.yaml` | The full stack: `db`, `backend` (API), `worker` and `scheduler` (background jobs), `web` (Caddy); `compose.override.yaml` adds development-only settings |
| `design/` | The UI design (open `FolkBook.dc.html` in a browser) |
| `docs/` | Product docs: decisions, UI flows |
| `AGENTS.md` | Conventions for contributors and AI agents |

## Troubleshooting

**"ports are not available … access permissions" on Windows.** Windows reserves some port ranges (check with `netsh interface ipv4 show excludedportrange protocol=tcp`). Pick a port outside them for `FOLKBOOK_PORT` in `.env`, and update `DJANGO_CSRF_TRUSTED_ORIGINS` to match.
