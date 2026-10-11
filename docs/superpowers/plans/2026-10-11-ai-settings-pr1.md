# AI settings (PR 1 of 2 for #32) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each user can set their own AI provider and an admin can set one for the whole server. Keys are encrypted at rest, Fetch models and Test connection work, and Settings → AI says which AI Quick capture will use.

**Architecture:**
- **Backend:** a new `ai` app holds one `AiProvider` row per user plus one for the server. Keys go through `core/secrets.py` (Fernet, keyed from `SECRET_KEY`). A small OpenAI-compatible client in `ai/client.py`, using the standard library only, serves both Fetch models and Test connection; PR 2 reuses it.
- **Frontend:** the Settings → AI page with two cards.

**Tech Stack:** Django + Ninja, `cryptography` (new), `urllib.request`; React + TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-quick-capture-design.md` §"Decisions" and §1. Design screens 5n and 5y in `design/FolkBook.dc.html`.

## Global Constraints

- **The key never leaves the server:** no API reply contains it; only `key_hint` (its last 4 characters) does.
- **Nothing reaches the logs:** no key, prompt or reply.
- **Test connection and Fetch models** return only plain results and model ids, never a provider's reply body.
- **Which AI a capture uses:** your own row, else the server's, else none.
- **The server row:** only admins (`is_staff`) save or remove it, or use its stored key.
- **Gemini preset base URL:** `https://generativelanguage.googleapis.com/v1beta/openai/`.
- **Base URLs:** `http://` and `https://` with any host. That includes bare names (`http://ollama:11434/v1`), LAN addresses and `localhost`; there's no domain check.
- **Timeouts:** 90 s for chat, 15 s for listing models.
- **Copy, verbatim:**
  - "Quick capture uses **your own key** · {Provider} · {model}";
  - "Quick capture uses **the server's AI**, set up by {name} · {Provider} · {model}";
  - "AI is off: Quick capture needs a key.";
  - "Only used when you press Suggest. Nothing is sent in the background.";
  - "Only for you";
  - "For everyone on this server", and its note "Everyone on this server who hasn't added their own key uses this. Their Quick capture text goes to this provider.";
  - "The server's AI: {Provider} · {model}, set up by {name}.";
  - "No server AI. Your admin can add one, or add your own key above.";
  - "Optional for local servers. Stored encrypted on this server.";
  - "The server must speak the OpenAI chat completions API.";
  - "This key can't be read anymore (the server's secret changed). Enter it again.";
  - "Connected · {model} answered in {640 ms | 1.2 s}";
  - "The key was refused."; "The model isn't there."; "Can't reach {base_url}"; "No answer in {n} seconds.";
  - the localhost hint: "Inside Docker, 'localhost' is FolkBook's own container. Use http://host.docker.internal:11434/v1 or your computer's network address."
- **Dependency:** `cryptography`, the only new one (say why in the commit body).

## Review Focus

1. **A form saved with the key untouched** keeps the stored key: `key` is left out of the PUT. Tests in Tasks 2 and 4.
2. **A member asking to use the server's stored key** (`saved: "server"`) gets 403. When an admin uses it, the stored base URL is used, never one from the request, so the key can't be sent somewhere else. Test in Task 3.
3. **Bare host names and trailing slashes:** `http://ollama:11434/v1` is accepted, and `…/v1` or `…/v1/` both reach `…/v1/chat/completions`. Tests in Tasks 2 and 3.
4. **Model ids written differently:** Gemini's list has `models/gemini-2.5-flash`, shown as `gemini-2.5-flash`; the list comes back sorted and without duplicates. Test in Task 3.
5. **`SECRET_KEY` changed after saving:** the page says the key can't be read, and saving a new key fixes it. Tests in Tasks 1, 2 and 4.

---

### Task 1: Secrets at rest

**Files:**
- Create: `backend/core/secrets.py`
- Modify: `backend/pyproject.toml`, `backend/uv.lock` (`uv add cryptography`)
- Test: `backend/tests/test_secrets.py`

**Interfaces:**
- Produces: `seal(text: str) -> str` and `unseal(token: str) -> str | None`. `None` means the token can't be read, because it's damaged or `SECRET_KEY` has changed.

- [ ] **Step 1: Write the failing tests**
  - `test_a_sealed_secret_opens_again`: `unseal(seal("sk-abc")) == "sk-abc"`, and `"sk-abc" not in seal("sk-abc")`.
  - `test_a_new_server_secret_cannot_open_old_ones`: seal, change `settings.SECRET_KEY`, then `unseal(token) is None`.
  - `test_garbage_does_not_open`: `unseal("not-a-token") is None`.
- [ ] **Step 2: Run** `cd backend && uv add cryptography && uv run --env-file ../.env pytest tests/test_secrets.py -q`
Expected: FAIL (the module is missing).
- [ ] **Step 3: Implement.**
  - Derive the Fernet key on every call (cheap, and it follows settings overrides): `HKDF(SHA256(), length=32, salt=None, info=b"folkbook secrets v1")` over `SECRET_KEY`, then `urlsafe_b64encode`.
  - `unseal` catches `InvalidToken` and returns `None`.
  - The module docstring says what changing `SECRET_KEY` does.
- [ ] **Step 4: Run** the tests, then ruff.
Expected: PASS.
- [ ] **Step 5: Commit** `feat(core): encrypt secrets at rest`. The body says why `cryptography` is added: the standard library has no authenticated encryption.

---

### Task 2: The `ai` app, its settings and their API

**Files:**
- Create:
  - `backend/ai/__init__.py`, `apps.py`, `models.py`, `services.py`, `schemas.py`, `api.py`;
  - the migration `0001`.
- Modify: `backend/config/settings.py` (`INSTALLED_APPS`), `backend/config/api.py` (`api.add_router("/ai", ai_router, auth=django_auth)`)
- Test: `backend/tests/ai/__init__.py`, `backend/tests/ai/test_settings.py`
- Regenerate: `frontend/openapi.json`, `frontend/src/api/schema.d.ts`

**Interfaces:**
- Produces:
  - **The model `AiProvider(BaseModel)`:**
    - `Kind = TextChoices("gemini" "Gemini", "openai_compatible" "OpenAI-compatible")`;
    - `user = OneToOneField(User, null=True, blank=True, on_delete=CASCADE, related_name="ai_provider")`;
    - `for_server = BooleanField(default=False)`;
    - `provider`, `base_url` (a `CharField(500, blank=True)`, not a `URLField`, which would refuse bare host names), `model` (`CharField(200)`), `key` (`TextField(blank=True)`, sealed);
    - `set_by = ForeignKey(User, null=True, SET_NULL, related_name="+")`.
    - Constraints: one row with `for_server=True` (`UniqueConstraint(fields=["for_server"], condition=Q(for_server=True))`), and `CheckConstraint` "`user` is null exactly when `for_server`".
  - **`ai.services`:**
    - `provider_for(user) -> AiProvider | None`: your own row, else the server's;
    - `ai_settings(user) -> dict`, the shape of `AiSettingsOut`;
    - `save_provider(user, data: AiProviderIn, *, server: bool) -> AiProvider`: `server` needs `user.is_staff`, otherwise `PermissionDenied`. A missing `key` keeps the stored one, `""` clears it, and anything else is sealed after stripping. It sets `set_by` on the server row;
    - `remove_provider(user, *, server: bool) -> None`;
    - `key_of(row) -> str | None`: unsealed; `""` without a key; `None` when it can't be read.
  - **Schemas:**
    - `AiProviderIn { provider: Literal["gemini", "openai_compatible"], base_url: str = "", model: str, key: str | None = None }`;
    - `AiProviderOut { provider, base_url, model, key_hint: str | None, key_unreadable: bool, set_by: str | None, updated_at }`, where `set_by` is the name, from their Me;
    - `AiSettingsOut { mine: AiProviderOut | None, server: AiProviderOut | None, using: Literal["mine", "server"] | None, can_manage_server: bool }`.
  - **Validation (422):**
    - `base_url` is required for `openai_compatible`, and must be `http://` or `https://` with a host;
    - for `gemini` it's stored blank;
    - `model` is required.
  - **Endpoints:** `GET /api/ai`, then `PUT` and `DELETE` on `/api/ai/mine` and `/api/ai/server`, each returning `AiSettingsOut`.

- [ ] **Step 1: Write the failing tests** (`test_settings.py`, using the `world` and `api` fixtures):
  - `test_nobody_has_ai_at_first`: `GET /ai` → `{mine: None, server: None, using: None, can_manage_server: False}` for a member, and `can_manage_server: True` for an admin. Make Ela admin with `is_staff=True`.
  - `test_saving_your_own_key_never_shows_it`: PUT `/ai/mine` with `gemini`, `gemini-2.5-flash` and `"AIzaSy-123-3f9a"` → `mine.key_hint == "3f9a"`, `using == "mine"`, and `"AIzaSy" not in response.content.decode()`. The stored `key` differs from the plain text, and `unseal` returns it.
  - `test_saving_without_a_key_keeps_the_stored_one` (Review Focus 1): save with a key, PUT again with no `key` and model `gemini-2.5-pro` → the hint is still "3f9a". A PUT with `key: ""` → `key_hint is None`.
  - `test_a_local_server_needs_no_key_and_any_host` (Review Focus 3): `openai_compatible`, `http://ollama:11434/v1`, `llama3.1:8b`, no key → 200.
  - `test_base_url_must_be_http`: `ftp://x` and `""` with `openai_compatible` → 422.
  - `test_the_server_ai_is_for_admins_to_set`:
    - a member's PUT or DELETE on `/ai/server` → 403;
    - an admin's PUT → the member's `GET` shows `server.set_by == "Ela"`, `using == "server"`, and no key text;
    - the member's own PUT then wins (`using == "mine"`), and their DELETE falls back to `"server"`.
  - `test_a_key_from_an_old_secret_cannot_be_read` (Review Focus 5): save, change `settings.SECRET_KEY` → `key_unreadable: True`, `key_hint: None`. Saving a new key → `key_unreadable: False`.
  - `test_ai_settings_need_the_login_cookie`: with an API key (the existing api-key test helper) → 401.
- [ ] **Step 2: Run** `uv run --env-file ../.env pytest tests/ai -q`
Expected: FAIL.
- [ ] **Step 3: Implement** to the Interfaces above. Run `makemigrations ai`, add the router, then `npm run api:generate`.
- [ ] **Step 4: Run** `uv run --env-file ../.env pytest -q && uv run ruff check . && uv run ruff format --check . && uv run python manage.py makemigrations --check --dry-run`, then `cd ../frontend && npm run typecheck`.
Expected: all pass.
- [ ] **Step 5: Commit** `feat(ai): your own AI provider, and one for the whole server`. Mention the migration `ai 0001`.

---

### Task 3: The client, Fetch models and Test connection

**Files:**
- Create: `backend/ai/client.py`
- Modify: `backend/ai/services.py`, `backend/ai/schemas.py`, `backend/ai/api.py`
- Test: `backend/tests/ai/stub.py` (a fixture: a local stand-in AI server), `backend/tests/ai/test_client.py`, `backend/tests/ai/test_check.py`
- Regenerate: the API types

**Interfaces:**
- Produces, in `ai/client.py`:
  - `GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"`.
  - `@dataclass(frozen=True) class Target`: `base_url: str`, `key: str`, `model: str = ""`. `Target.of(row: AiProvider) -> Target` unseals the key (`""` when there's none) and uses the preset for Gemini.
  - `class AiError(Exception)`: `.kind`, one of `refused`, `no_model`, `unreachable`, `timeout`, `bad_answer`, `failed`, and `.message` (the copy from Global Constraints; `unreachable` adds the localhost hint for `localhost`, `127.0.0.1` and `::1`).
  - `chat(target: Target, messages: list[dict], schema: dict | None = None, timeout: float = 90) -> str`:
    - POST `{base}/chat/completions`, joining `base` and the path with exactly one `/`;
    - the key goes in `Authorization: Bearer …` (no header without a key);
    - with a schema it sends `response_format: {"type": "json_schema", "json_schema": {"name": "capture", "schema": schema, "strict": True}}`, and on a 400 whose body mentions `response_format` it retries once with `{"type": "json_object"}`;
    - it returns `choices[0].message.content`.
  - `list_models(target: Target, timeout: float = 15) -> list[str]`: GET `{base}/models` → `data[].id`, with any leading `models/` dropped, deduplicated and sorted.
  - HTTP status to kind: 401 and 403 → `refused`, 404 → `no_model`, anything else ≥ 400 → `failed`. A connection error → `unreachable`; a timeout → `timeout`; a non-JSON reply → `bad_answer`.
- Produces, in `ai.services`:
  - `target_for_check(user, data: AiCheckIn) -> Target`:
    - with `data.key` given → a Target from the form, with the base URL from the form (or the Gemini preset);
    - with `data.saved` given → the stored row as it is (its base URL and key; only `model` may come from the form). `saved="server"` needs `is_staff`, otherwise `PermissionDenied`;
    - otherwise → the form with no key.
  - `test_connection(target) -> AiTestOut`: `chat` with `[{"role": "user", "content": "Reply with the single word: ok"}]` and a 30 s timeout, measuring milliseconds.
    - Success: `ok=True, message="Connected · {model} answered in {t}"`, where `t` is "640 ms" under a second and "1.2 s" from one second up.
    - An `AiError`: `ok=False, message=error.message`.
- Schemas: `AiCheckIn { provider, base_url: str = "", model: str = "", key: str | None = None, saved: Literal["mine", "server"] | None = None }`, `AiTestOut { ok: bool, message: str, millis: int | None }`, `AiModelsOut { models: list[str], message: str | None }`.
- Endpoints: `POST /api/ai/models` → `AiModelsOut` (on an `AiError`: `models: []` and the message); `POST /api/ai/test` → `AiTestOut`.

- [ ] **Step 1: Write the failing tests.**
  - `tests/ai/stub.py`: a fixture `stub_ai` running a `ThreadingHTTPServer` on `127.0.0.1:0` in a thread.
    - It records each request (method, path, headers, JSON body) and answers from a per-test queue of `(status, body)`.
    - It gives you its `url` (`http://127.0.0.1:{port}/v1`) and can delay a reply.
  - `test_client.py`:
    - `test_chat_sends_the_messages_and_the_key`: the path is `/v1/chat/completions`, the header is `Authorization: Bearer sk-1`, and the content is returned.
    - `test_no_key_no_header`.
    - `test_trailing_slash_or_not` (Review Focus 3): bases `…/v1` and `…/v1/` both reach `/v1/chat/completions`.
    - `test_structured_output_falls_back_to_json_mode`: a first 400 `{"error": "response_format json_schema unsupported"}`, then a 200 → two requests, the second with `{"type": "json_object"}`.
    - `test_errors_have_kinds`: 401 → `refused` "The key was refused."; 404 → `no_model`; a closed port → `unreachable` "Can't reach http://127.0.0.1:{port}/v1"; a delay past `timeout=0.2` → `timeout`; 200 with `"nonsense"` → `bad_answer`.
    - `test_localhost_gets_the_docker_hint`: an unreachable `http://localhost:{closed port}/v1` → the message ends with the localhost hint.
    - `test_models_are_listed_by_their_short_names` (Review Focus 4): `{"data": [{"id": "models/gemini-2.5-pro"}, {"id": "models/gemini-2.5-flash"}, {"id": "models/gemini-2.5-flash"}]}` → `["gemini-2.5-flash", "gemini-2.5-pro"]`.
  - `test_check.py` (API):
    - `test_test_connection_reports_how_long`: the stub answers → `ok: True` and a message starting "Connected · llama3.1:8b answered in ".
    - `test_test_connection_says_why_not`: 401 → `ok: False, message: "The key was refused."`.
    - `test_fetch_models_with_the_saved_key`: the member saved their own key → `POST /ai/models {saved: "mine", provider, base_url: stub}` sends `Bearer` with the saved key.
    - `test_only_admins_use_the_server_key` (Review Focus 2): a member with `saved: "server"` → 403. An admin with `saved: "server"` and `base_url: "http://elsewhere.invalid"` → the request goes to the stored stub URL, not to `elsewhere`.
    - `test_check_never_returns_the_reply`: the stub answers `{"error": "secret internal page"}` with 500 → the response contains neither "secret" nor "internal".
- [ ] **Step 2: Run** `uv run --env-file ../.env pytest tests/ai -q`
Expected: the new tests FAIL.
- [ ] **Step 3: Implement** with `urllib.request`. Map `HTTPError` and `URLError` (a timeout shows up as `URLError(reason=TimeoutError)` or `socket.timeout`). Never log keys, bodies or prompts; log only the kind and the host, at INFO.
- [ ] **Step 4: Run** the whole backend suite plus ruff, then regenerate the types and run the typecheck.
Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): fetch models and test the connection`.

---

### Task 4: Settings → AI

**Files:**
- Create: `frontend/src/features/ai/queries.ts`, `frontend/src/features/ai/AiSettings.tsx`, `frontend/src/features/ai/AiProviderForm.tsx`, `frontend/src/features/ai/copy.ts`
- Modify: `frontend/src/features/settings/sections.ts` (the entry `{ to: '/settings/ai', label: 'AI', admin: false }` after API keys), `frontend/src/router.tsx` (the route)
- Test: `frontend/src/features/ai/AiSettings.test.tsx`

**Interfaces:**
- Consumes: Task 2's `GET /api/ai`, `PUT` and `DELETE` on `/api/ai/{mine,server}`, and Task 3's `POST /api/ai/models` and `/api/ai/test`. The types come from `components['schemas']`.
- Produces:
  - `aiSettingsQuery` (key `['ai']`);
  - `saveAi(queryClient, scope: 'mine' | 'server', body)` and `removeAi(queryClient, scope)`, each setting the query's data from the reply;
  - `fetchModels(body)` and `testAi(body)`, used by PR 2 for the "which AI" line;
  - `aiUsageLine(settings)` in `copy.ts`, which builds the top line.

**The page** (`SettingsPage title="AI"`):
- **The top line**, `aiUsageLine`, and under it "Only used when you press Suggest. Nothing is sent in the background."
- **The "Only for you" card:** `AiProviderForm scope="mine"`, the form for one card:
  - the provider as two `Choice` boxes: Gemini ("Google AI Studio key") and OpenAI-compatible ("Ollama, LM Studio, vLLM, OpenAI…");
  - Base URL, only for OpenAI-compatible, with its note;
  - API key:
    - while one is saved: "•••• 3f9a" and a Replace button that shows the input;
    - empty, or unreadable: the input;
    - its note: "Optional for local servers. Stored encrypted on this server.";
  - Model, with **Fetch models**, which fills a `<datalist>` for the input;
  - **Test connection**, with the result line beside it (`role="status"`), and **Save**;
  - **Remove**, as an in-place confirm: "Remove your key? Quick capture will use the server's AI." (or "…AI will be off.");
  - the body leaves out `key` unless the input was shown and touched (Review Focus 1);
  - Test connection and Fetch models send `saved: scope` when no key was typed.
- **The "For everyone on this server" card:**
  - admins get the same form with `scope="server"` and the note "Everyone on this server who hasn't added their own key uses this. Their Quick capture text goes to this provider.";
  - members get only the read-only line, or the "No server AI…" line.
- **An unreadable key** (`key_unreadable`) shows its sentence above the key input.

- [ ] **Step 1: Write the failing tests** (`fakeServer`; a member and an admin):
  - `it('says which AI Quick capture uses')`: three cases.
    - With your own key: "Quick capture uses your own key · Gemini · gemini-2.5-flash" and "•••• 3f9a".
    - With only the server's: "…uses the server's AI, set up by Ela · OpenAI-compatible · llama3.1:8b". A member gets no server form, and sees "The server's AI: OpenAI-compatible · llama3.1:8b, set up by Ela."
    - With neither: "AI is off: Quick capture needs a key." and "No server AI. Your admin can add one, or add your own key above."
  - `it('saves your own key')`: pick OpenAI-compatible, type the base URL `http://ollama:11434/v1`, the key and the model, then Save → PUT `/api/ai/mine` with exactly `{ provider: 'openai_compatible', base_url: 'http://ollama:11434/v1', model: 'llama3.1:8b', key: 'sk-local' }`.
  - `it('keeps the saved key unless you replace it')` (Review Focus 1): with a key saved, change the model and Save → the body has no `key`. After Replace and typing → `key` is sent.
  - `it('fetches models and tests the connection')`: Fetch models → the `datalist` options are the returned ids. Test connection → "Connected · gemini-2.5-flash answered in 640 ms". With no key typed, both bodies carry `saved: 'mine'`.
  - `it('lets an admin set the server AI')`: an admin sees the server form with its note → PUT `/api/ai/server`.
  - `it('removes your key after asking')`: the confirm text, then DELETE `/api/ai/mine`.
  - `it('asks again for a key it cannot read')` (Review Focus 5): `key_unreadable: true` → the sentence, and the key input is shown.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/features/ai`
Expected: FAIL.
- [ ] **Step 3: Implement.** Follow `ApiKeysSettings` for page structure, `SettingsPart` for the cards, and `Choice` for the provider. The settings page's mobile sub-page pattern comes from `SettingsLayout`, so it needs no extra work.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run format:check`
Expected: all pass.
- [ ] **Step 5: Commit** `feat(ai): Settings → AI, for you and for the whole server`.

---

### Task 5: Docker, docs, the real-app check, the PR

**Files:**
- Modify: `compose.yaml` (backend `extra_hosts: ["host.docker.internal:host-gateway"]`), `README.md`, `docs/DECISIONS.md`, `docs/UI_FLOWS.md` §3.15, `AGENTS.md`

- [ ] **Step 1: Compose.** Add the `extra_hosts` line, then run `docker compose -f compose.yaml config` to check the file still reads (Expected: no error).
- [ ] **Step 2: Docs.**
  - **README:** an "AI (Quick capture)" section:
    - Gemini: a key from AI Studio, model e.g. `gemini-2.5-flash`;
    - OpenAI-compatible: base URL, optional key;
    - a model on the same computer: `http://host.docker.internal:11434/v1` (Ollama) or `:1234/v1` (LM Studio);
    - the server-wide key is for admins;
    - changing `DJANGO_SECRET_KEY` means entering AI keys again.
  - **DECISIONS:** the server-wide key, and "only your text and today's date go to the provider".
  - **UI_FLOWS §3.15:** AI as built.
  - **AGENTS.md:** secrets go through `core/secrets.py`.
  - Commit `docs(ai): AI settings, keys and local models`.
- [ ] **Step 3: In the real app.**
  - Use the throwaway `folkbook_preview` database with Ela (admin) and Deniz (member).
  - Run a stand-in OpenAI-compatible server (a 20-line Python `http.server` in the scratchpad, answering `/v1/models` and `/v1/chat/completions`) on port 8020. Backend on :8000, Vite on :5173, Chrome via Playwright.
  - **Desktop light,** as Ela:
    - save her own key pointing at `http://localhost:8020/v1`: Fetch models, Test connection "Connected · …";
    - set the server AI;
    - point it at a closed port and see "Can't reach …" with the localhost hint.
  - **As Deniz:** the read-only server line, and "uses the server's AI, set up by Ela".
  - **Phone dark:** the AI page; screenshots.
  - Console errors: only the 401s before logging in. Drop the database afterwards.
- [ ] **Step 4: Final review, PR.**
  - Whole-branch review (executing-plans), then the fix pass.
  - Push `feat/ai-settings` and open the PR with "Part of #32". Merge when CI is green, and delete the branch.
