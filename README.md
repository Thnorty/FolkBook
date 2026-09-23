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

For a real server, set `SITE_ADDRESS` to your domain (e.g. `folk.example.com`) and Caddy gets an HTTPS certificate automatically. Use `docker compose -f compose.yaml up -d` there so the development overrides aren't applied.

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

### Checks

Backend (Postgres must be running):

```bash
cd backend && uv run --env-file ../.env pytest && uv run ruff check . && uv run ruff format --check .
```

Frontend:

```bash
cd frontend && npm test && npm run typecheck && npm run lint && npm run format:check
```

## Project layout

| Path | What |
|---|---|
| `backend/` | Django + Django Ninja API |
| `frontend/` | Vite + React + TypeScript app |
| `caddy/` | Web server: serves the frontend, proxies the API, handles HTTPS |
| `compose.yaml` | The full stack; `compose.override.yaml` adds development-only settings |
| `design/` | The UI design (open `FolkBook.dc.html` in a browser) |
| `docs/` | Product docs: UI flows |
| `AGENTS.md` | Conventions for contributors and AI agents |

## Troubleshooting

**"ports are not available … access permissions" on Windows.** Windows reserves some port ranges (check with `netsh interface ipv4 show excludedportrange protocol=tcp`). Pick a port outside them for `FOLKBOOK_PORT` in `.env`, and update `DJANGO_CSRF_TRUSTED_ORIGINS` to match.
