# Quick capture with AI (#32)

## Goal

Write what happened the way you'd tell a friend ("Met Tom at the hackathon, designer at Spotify, he's Emma's cousin, likes climbing"). FolkBook suggests what to save: new people, matches to people you have, field changes, connections, memory aids and timeline entries. You review and edit every suggestion before anything is saved, and you can undo it all from the summary.

## Decisions (from the brainstorm)

- **Whose AI:** each user can set their own key ("only you"). An admin can also set one for the whole server ("everyone on this server"). A capture uses your own key if you have one, otherwise the server's, otherwise AI is off. The UI always says which one applies.
- **Existing people:** a capture may suggest changing a matched person's fields, shown as "Work: Google → Spotify" for you to approve. You can only change what you're allowed to edit.
- **Undo:** "Undo all of this" lives on the summary right after saving. After that, everything is ordinary data you edit or delete as usual.
- **Timeline entries:** a capture may also suggest logging what happened ("Met · yesterday · Coffee…").
- **What leaves the server:** only the text you typed and today's date. The AI extracts mentions; FolkBook matches names to your people on the server, so your book is never sent to the provider.
- **Providers:** one OpenAI-compatible client built on Python's standard library. "Gemini" is a preset base URL (`https://generativelanguage.googleapis.com/v1beta/openai/`). It works with OpenAI, OpenRouter, Ollama, LM Studio, vLLM… Nothing blocks `http://`, local network addresses or bare host names.
- **Key at rest:** encrypted with Fernet (the `cryptography` package, the one new dependency), with the key derived from `DJANGO_SECRET_KEY`. If that secret changes, saved AI keys can't be read, and Settings asks to re-enter them.
- **Waiting:** Suggest waits for the reply, up to 90 seconds. Gunicorn already allows 300 s.

## Delivery

1. **PR 1: AI settings.** The `ai` app, key encryption, Settings → AI, Fetch models and Test connection, the Docker `host.docker.internal` mapping, docs.
2. **PR 2: Quick capture.** Suggest, review, save, the summary with undo, the "AI is off" page, and the end-to-end test. Closes #32.

## 1. AI settings (PR 1)

### Storage

- **A new app, `ai`, with one model, `AiProvider`:**
  - `user`: null for the server's row; a unique constraint allows one row per user and one server row;
  - `provider`: `gemini` / `openai_compatible`;
  - `base_url`: blank for Gemini, which uses the preset;
  - `model`;
  - `key`: encrypted text, may be blank (local servers often need none);
  - `set_by`: the admin who saved the server's row;
  - `updated_at`.
- **`core/secrets.py`:**
  - `seal(text: str) -> str` and `unseal(token: str) -> str | None`;
  - `None` means unreadable (the secret key changed);
  - the Fernet key is derived from `SECRET_KEY` with HKDF under a fixed FolkBook label.
- **`ai.services.provider_for(user) -> AiProvider | None`:** your own row, else the server's, else `None`.

### API (`/api/ai`)

- **`GET /api/ai`:** `{ mine, server, using, can_manage_server }`.
  - `mine` and `server` are each `null` or `{ provider, base_url, model, key_hint, key_unreadable, set_by?, updated_at }`.
  - `key_hint` is the last four characters ("3f9a"), or `null` without a key.
  - `using` is `"mine" | "server" | null`.
  - The key itself is never returned.
- **`PUT /api/ai/mine` and `DELETE /api/ai/mine`.** The PUT body is `{ provider, base_url, model, key? }`. Leaving `key` out keeps the stored one; `""` removes it.
- **`PUT /api/ai/server` and `DELETE /api/ai/server`:** admins only; anyone else gets 403.
- **`POST /api/ai/models` with `{ provider, base_url, key?, saved? }`:** lists model ids (`GET {base}/models`). `saved: "mine" | "server"` uses the stored key when the form left the key out (the server's only for admins).
- **`POST /api/ai/test`** with the same body plus `model`. It sends a one-word prompt and returns `{ ok, message, millis }`:
  - "Connected · gemini-2.5-flash answered in 640 ms";
  - "The key was refused." (401/403);
  - "The model isn't there." (404);
  - "Can't reach http://…";
  - "No answer in 90 seconds."
- **Never the provider's reply:** Test connection and Fetch models return only these plain results and ids, never the response body. Pointing a base URL at another machine on the network reveals nothing beyond "reachable or not".
- **The `localhost` hint:** when an address with the host `localhost`, `127.0.0.1` or `::1` can't be reached, the message adds: "Inside Docker, 'localhost' is FolkBook's own container. Use http://host.docker.internal:11434/v1 or your computer's network address."
- **Validation:** `provider` is required; `base_url` is required for `openai_compatible` (http or https); `model` is required.

### The client (`ai/client.py`)

- **`chat(provider, messages, schema=None, timeout=90) -> str`:** a POST to `{base}/chat/completions`.
  - The key goes in `Authorization: Bearer …`, when there is one.
  - With a schema it sends `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }`. If the server answers 400 about the response format, it retries once with `{ type: "json_object" }`.
- **`models(provider) -> list[str]`.**
- **Errors:** both raise `AiError(kind, message)`, where `kind` is `refused` / `unreachable` / `timeout` / `no_model` / `bad_answer` / `failed`.
- **Logging:** the key, the text and the replies are never logged, only the kind and the host.

### Settings → AI (screens 5n, 5y)

A new section in Settings, after Profile & account and API keys.

- **The top line:**
  - "Quick capture uses **your own key** · Gemini · gemini-2.5-flash";
  - "…uses **the server's AI**, set up by Ela · Gemini · gemini-2.5-flash";
  - or "AI is off: Quick capture needs a key."
  - Under it: "Only used when you press Suggest. Nothing is sent in the background."
- **The "Only for you" card:**
  - Provider choice: Gemini ("Google AI Studio key") or OpenAI-compatible ("Ollama, LM Studio, vLLM, OpenAI…").
  - Base URL, for OpenAI-compatible only: "The server must speak the OpenAI chat completions API."
  - API key: "•••• 3f9a" with Replace. "Optional for local servers. Stored encrypted on this server."
  - Model, with Fetch models (a picker filled from the list).
  - Test connection, with its result line, and Save.
  - Remove: "Remove your key? Quick capture will use the server's AI." (or "…AI will be off.")
- **The "For everyone on this server" card:**
  - For admins, the same form, headed "Everyone on this server who hasn't added their own key uses this. Their Quick capture text goes to this provider."
  - For members, read-only: "The server's AI: Gemini · gemini-2.5-flash, set up by Ela." or "No server AI. Your admin can add one, or add your own key above."
- **A key that can't be read:** "This key can't be read anymore (the server's secret changed). Enter it again."
- **Mobile:** the settings sub-page pattern, as for the other sections.

### Docker and docs

- **`compose.yaml`:** the backend gets `extra_hosts: ["host.docker.internal:host-gateway"]`, so a model on the host machine is reachable on Linux too.
- **README:** an "AI (Quick capture)" section: Gemini key from AI Studio, a local model through `host.docker.internal`, and that changing `DJANGO_SECRET_KEY` means re-entering AI keys.
- **DECISIONS.md:** the server-wide key, and "only your text and today's date go to the provider".
- **UI_FLOWS §3.15:** the AI settings as built.
- **AGENTS.md:** secrets go through `core/secrets.py`.

## 2. Suggest, save, undo (backend, PR 2)

### Suggest: `POST /api/capture/suggest`

- **Body:** `{ text, today, space_id? }`. The text is 1–4,000 characters; `today` comes from the device (dates follow its time zone); `space_id` is optional.
- **No AI:** the reply is 409 "AI is off: add a key in Settings → AI."
- **The prompt:** a system prompt plus the text and today's date. The AI returns this shape (the JSON schema; "refs" tie the parts together, and `me` is the writer):
  - `people: [{ ref, name, how_we_met?, work?, birthday?: "YYYY-MM-DD" | "--MM-DD", tags: [] }]`;
  - `connections: [{ a: ref | "me", b: ref | "me", type, label? }]`, where `type` is one of `parent`, `partner`, `sibling`, `cousin`, `grandparent`, `aunt_uncle`, `friend`, `colleague`, `classmate`, `met_at`, `custom`;
  - `memory_aids: [{ about: ref, text }]`;
  - `entries: [{ about: ref, kind: met | call | message | event | other, date: "YYYY-MM-DD", note }]`.
- **Then the server:**
  - validates the shape (`bad_answer` after one retry);
  - drops anything that refers to an unknown ref;
  - matches each person's name against the people you can see (`visible_people`, the import's Unicode matching).
- **The draft** (the reply; nothing is stored):
  - **People:** `new`, or `match` with the person and a detail line, or `choose` with up to three candidates.
  - **Field changes for a matched person:** `{ person, field, from, to, can_edit, why_not? }`.
    - Fields: `how_we_met`, `work`, `birthday`, plus added tags.
    - Never an existing person's spaces: putting someone in a shared space shows them to its members, which keeps its own confirmation (Add person / the space page).
    - `can_edit` is decided by `access/policy.py`.
  - **Connections, memory aids and entries,** each with a draft id.
  - **Spaces** for new people: the chosen space, if any.

### Save: `POST /api/capture/save`

- **Body:** the reviewed items. New people carry their fields and spaces; a person ref resolves to `new` or an existing id; then the approved field changes, connections, memory aids and entries.
- **Checked like typed input:** the people must be visible to you, and each write needs its `can_*`. A change you can't make is a 403 for the whole save, and nothing is saved.
- **One transaction,** through the existing services:
  - people are created as with Add person;
  - connections in the stored order;
  - a connection's space is the chosen space when both people are in it, otherwise none (private to you);
  - memory aids and entries as private as always;
  - an entry resets keep-in-touch.
- **The `Capture` row:**
  - who saved it;
  - when;
  - the ids of what was created;
  - for each changed field, its old and new value;
  - no text.
- **The reply:**
  - the capture id;
  - the counts;
  - what was saved, for the summary: "Added 1 person, 1 connection and 1 memory aid. Emma matched to someone you already had."

### Undo: `POST /api/capture/{uuid:capture_id}/undo`

- Only the person who saved it, and only once (409 after that).
- It deletes what the capture created and puts changed fields back, unless a field has changed since; the newer value stays.
- A periodic job deletes `Capture` rows older than a day.

### Errors (shown as they are, in the app's words)

- "The AI didn't answer in time (90 s)."
- "The AI's answer didn't make sense. Try again."
- "Your key was refused. Check Settings → AI."
- "Can't reach the AI at http://…", plus the localhost hint.

## 3. The capture screens (frontend, PR 2)

- **Write (2d, 2e):** `/capture` replaces the placeholder. The "+" button and Shift+N already lead there.
  - The notebook-page textarea.
  - "Put everyone in a space" with a space picker.
  - The phrasing chips ("Coffee with …", "… is …'s sister", "Met … at …") insert their text.
  - "Gemini 2.5 Flash · your key" or "· the server's, set up by Ela".
  - Suggest (Ctrl/⌘+Enter).
  - "Write like you'd tell a friend. Nothing is saved until you review it." with *Use the form instead* (`openNew()`).
- **AI is off (2j):** "Quick capture needs an AI key of your own. Add a Gemini or OpenAI-compatible key in Settings. Your text goes from your FolkBook server to the provider you pick, and nowhere else. Local models work too." Then *Add a key in Settings →* and *Fill in the form myself*. When the server has no AI and you're an admin, it also mentions the server key.
- **Reading (2f):**
  - "Reading it back…" with the text and Cancel, which aborts the request;
  - after 10 s, "Local models can take a minute.";
  - errors show here, with Try again and Edit text.
- **Review (2g; 2h on phones, stacked):** "Here's what I read", then one card per suggestion, each with a checkbox:
  - **New person:** name, how we met, work, birthday, spaces and tags as chips.
  - **"Who is 'Emma'?"** (NEEDS YOU): the candidates with detail lines, "Someone else: create a new 'Emma'", and `PersonSearch`. Save waits until every one of these is chosen, and says so through `warnAt`.
  - **Field change:** "Emma Yılmaz · Work: Google → Spotify". When it can't be made, it's greyed out with its reason.
  - **Connection:** the type as chips (with the full list), the space, and the "other family" explanation for cousins and the like.
  - **Memory aid:** "on Tom · Memory aids stay private, even in shared spaces."
  - **Timeline entry:** kind, date and note, all editable.
  - **Unticking a new person** unticks everything about them.
  - **Below the cards:**
    - "+ Add something the AI missed": a person, a connection, a memory aid or an entry;
    - "4 of 4 selected", Discard, **Save 4 items**;
    - Edit text, which keeps the text.
- **Saved (2i):**
  - the summary sentence and what was saved;
  - *Open Tom's page*, *Capture something else*, **Undo all of this**;
  - Undo is immediate, followed by a toast "Undone: …";
  - the text and the draft live only in the page.
- **Motion, themes, keyboard:** follows AGENTS (reduced motion, light and dark, phones and desktop). Esc on the review asks nothing; it goes back to the text.

## Words

"Capture", "Suggest", "Here's what I read", "Who is “Emma”?", "Undo all of this"; the error messages above. Connection types use the existing labels (`linkLabel`).

## Tests

- **Backend:**
  - `seal`/`unseal`, and an unreadable token after the secret changes;
  - the AI API never returns a key, and the server row is admin-only (403);
  - `provider_for`: mine, then the server's, then none;
  - the client against a local stand-in HTTP server: the request shape, `json_schema` then `json_object`, refused, unreachable, timeout, no model, the localhost hint;
  - suggest with a fake provider: matching only among visible people (privacy), `choose` for several candidates, field changes with `can_edit` for a shared person;
  - save: the transaction, 403 for a change you can't make, the connection's space rule, an entry resetting keep-in-touch;
  - undo: removes and restores, keeps a newer value, owner-only, only once;
  - the cleanup job.
- **Frontend:**
  - Settings → AI: mine, server, admin vs member, the key hint, Replace, Test connection, Fetch models;
  - capture: write, AI off, reading, cancel, errors, review (each card, choose, untick cascade, add), save, summary, undo.
- **End-to-end (`quick-capture.spec.ts`):**
  - Playwright starts a tiny fake OpenAI-compatible server on port 8020;
  - Ela points Settings → AI at it and tests the connection;
  - she captures "Met Tom…" and reviews the suggestions;
  - she saves, opens Tom's page, then undoes the capture.
- **In the real app:** the same with Gemini, if a key is at hand, or with a local model; desktop light, phone dark, reduced motion.
