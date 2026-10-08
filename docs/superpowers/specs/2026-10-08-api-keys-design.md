# Personal API keys (#38)

## Goal

Keys for scripts and apps (Home Assistant, a birthday script, an Obsidian sync) to read or write the user's own book, each narrowed to what the user chooses: read-only or read-write, some spaces or all, with or without their private notes. A leaked key is easy to spot (last used) and to stop (revoke, expiry).

## Delivery

Two PRs:

1. **Backend:** the key model, signing in with a key, the rate limit, the key-management endpoints, and API-key privacy tests across the endpoints.
2. **Settings screens:** Settings → API keys (screens 5o–5q, 5z), and a check in the real app that calls the API with a new key.

## 1. The key

- **Format:** `fb_live_` followed by 32 random characters from `secrets.token_urlsafe`, letters and digits only.
- **Storage:** the server keeps only the SHA-256 hash of the whole key. A slow password hash isn't needed, because keys are random and long. It also keeps the last 5 characters to show (`fb_…14k42`).
- **Shown once:** the full key is returned once, in the create response, and never again.
- **Model `api_keys.ApiKey`:**
  - `owner` (the user; deleting the account deletes their keys);
  - `name` (1–60 characters, required);
  - `hashed` (unique, indexed), `last_five`;
  - `read_only` (bool);
  - `include_private` (bool, default off);
  - `limited` (bool) and `spaces` (many-to-many to Space): not limited means all spaces;
  - `expires_at` (null means never);
  - `last_used_at`;
  - `window_start` and `window_count` (the rate limit, see §3);
  - `created_at`.
- **Expiry choices** when creating: 30 days, 90 days, 1 year, never. Stored as a date and time.

## 2. Signing in with a key

- **The header:** a request with `Authorization: Bearer fb_live_…` signs in with that key. No cookie or CSRF token is needed, since a header can't be sent by another site the way a cookie can.
- **How it plugs into Ninja:** the API's default auth becomes `[ApiKeyAuth(), django_auth]`, and either one can sign a request in.
- **When it fails:** an unknown key, an expired key, or one whose owner is disabled gets **401** `{"detail": "This API key isn't valid."}`. A key that has expired gets the same 401, so nothing tells a stranger which keys exist.
- **The key's access:** a valid key sets `request.auth` to its owner and keeps its `Access` on the request:
  - `Access.limited(owner, space_ids=…, include_private=…, read_only=…)`, with all spaces as `space_ids=None`;
  - `core.api.access_for(request)` returns that access, and a login cookie still gets full access;
  - every endpoint already asks `access_for`, so `access/policy.py` decides what each key sees and can change, exactly as for narrowed access today.
- **A key's spaces are a ceiling, not a grant.** If the user leaves a space, the key loses it too, because the policy only shows spaces the user can see. A deleted space simply drops off the key.
- **Login cookie only:** these endpoints refuse keys (401, as if no one signed in), because they act on the account rather than the book:
  - everything under `/api/auth` except `GET /api/auth/me`;
  - `/api/setup`, `/api/users`, `/api/invites`;
  - `/api/api-keys` (a key can't make or see keys);
  - restore (`/api/export/restore/check`, `/api/export/restore`).

  They declare `auth=django_auth`. A test lists every API route and checks it is either in this list or accepts keys, so a new endpoint has to be put on one side on purpose.
- **What a read-write key can do:** everything the app can do within its spaces, as the user decided. That includes adding, editing and tearing out people, links, notes, memory aids, timeline, keep-in-touch, spaces and sharing, import and undo. It always stays within what `policy.py` allows for the key's access:
  - read-only keys get **403** on every write;
  - private notes, memory aids and timeline need `include_private`;
  - anything outside the key's spaces is **404**.
- **The rules that work across the whole book** stay as the policy has them. Importing, and a full export, need full access: `can_import` and `can_export_everything` refuse a key that is space-limited or has no private access.

## 3. Rate limit and "last used"

- **The limit:** 120 requests a minute per key.
- **One query per request:**
  - When a key signs in, a single atomic `UPDATE … RETURNING` sets `last_used_at = now`. It starts a new window if the current one began more than a minute ago (`window_start = now, window_count = 1`), and otherwise adds one to `window_count`.
  - It is exact across several server processes and needs no cache.
- **Over the limit:** **429** `{"detail": "Too many requests for this API key. Try again in a minute."}` with a `Retry-After` header (the seconds left in the window).
- **The login cookie** isn't rate limited (unchanged).

## 4. Managing keys (`/api/api-keys`, login cookie only)

- **`GET /api/api-keys`:** your keys, newest first, as `{items, count}`. Each item is `{id, name, last_five, read_only, include_private, spaces: [SpaceRef], expires_at, last_used_at, created_at, expired}`. The spaces are only those you can still see.
- **`POST /api/api-keys`:** `{name, read_only, include_private, space_ids: [uuid] | null, expires_in: "30d" | "90d" | "1y" | "never"}`. It returns the key with the `key` field: the full key, the only time it's sent.
  - A name that's missing or too long gets 422.
  - A space you can't see gets 422 `{"space_ids": "…"}`. A 404 would say whether the space exists, and the field error is clearer in a form.
  - No spaces picked (`space_ids: []`) gets 422 ("Pick at least one space, or All spaces.").
- **`DELETE /api/api-keys/{uuid:id}`:** revokes the key: it is deleted, and anything using it gets 401 right away. The same call removes an expired key. It returns 204.
- **Policy:** `visible_api_keys(access)` returns the user's own keys and nobody else's, so another user's key is 404. Managing keys needs the login cookie.

## 5. Settings → API keys (PR 2)

- **Where:** a new section after Profile & account. The design puts AI in between; it doesn't exist yet. The line under the heading reads: "For scripts and apps that read or write your book. Each key only sees the spaces you pick."
- **List:** a table on desktop (screen 5o), cards on phones. Columns:
  - **Name**, with `fb_…14k42` under it;
  - **Scope:** "read-only" or "read-write", "+ private notes", and "All spaces" or the space names;
  - **Last used:** "2 hours ago", or "Never used";
  - **Expires:** "Never", a date, or "Expired";
  - **Revoke.** It confirms in place: "Revoke “Birthday script”? Anything using it stops working right away." with Cancel and Revoke key. An expired key shows **Delete** instead.

  With no keys yet, the page shows its line and **+ Create key**.
- **Create key** (screen 5p): `FormDialog`, a sheet on phones.
  - **Name**, required.
  - **Scope:** Read-only ("Look up people and links") or Read-write ("Also add and edit people").
  - **Limited to spaces:** ticks for each of your spaces, or All spaces (the default).
  - **"Include my private notes, memory aids and timeline":** off, with the note "Off by default. Only yours — never what other members write."
  - **Expires:** 30 days, 90 days (the default), 1 year, Never.
  - **Create key.**
- **Key created** (screens 5q, 5z):
  - "Copy it now — you won't see it again." and "If you lose it, revoke it and make a new one.";
  - the key's summary ("Obsidian sync · read-write + private notes · Friends, Family");
  - the key in a monospace box with **Copy** ("Copied ✓");
  - "Expires 22 Sep 2027." or "Never expires.", then "Use it as `Authorization: Bearer …`";
  - **I've saved it** closes it. The key exists only in that dialog's state and is gone when it closes.
- **Strings:** the scope summary is built by one helper, shared by the list and the shown-once dialog.

## Docs

- `docs/DECISIONS.md`: the key format, which endpoints refuse keys, the rate limit.
- README: a short "Using the API" section (`Authorization: Bearer …`, the docs at `/api/docs`, the limit).

## Errors and edge cases

- **Disabled owner:** a key whose owner is disabled stops working (401). Re-enabling the user brings it back.
- **Spaces that change:**
  - A key limited to spaces that are all deleted later sees nothing. It isn't silently widened to all spaces: the key keeps "limited", and its list row says "No spaces left".
  - That's why `limited` is its own field: an empty spaces relation is never read as "all spaces".
- **Two keys with the same name** are fine.
- **Revoking mid-request:** a request already past sign-in finishes. The next one gets 401.
- **Keys in logs:** never logged. The `Authorization` header isn't in any log we write.

## Tests

- **Signing in:**
  - a valid key works;
  - unknown, expired and disabled-owner keys get 401;
  - a key works without a CSRF token on writes;
  - a login-cookie-only endpoint refuses a key;
  - the route test (every route is cookie-only or accepts keys).
- **Rate limit:** the 121st request in a minute gets 429 with `Retry-After`; a new minute starts again; `last_used_at` is set.
- **Managing keys:**
  - create returns the key once, and the list never does;
  - stored is the hash, not the key;
  - validation (name, spaces, empty spaces);
  - revoke, delete expired;
  - another user's key is 404;
  - a key can't manage keys.
- **Privacy with real keys** (AGENTS.md): through the API, with a read-only key, a space-limited key, and a key without private notes:
  - people, search, graph, relationships, notes/memory aids/timeline, Today, export, imports;
  - each sees exactly what it should;
  - read-only writes get 403, outside its spaces gets 404.
- **Frontend:** the list (scope summary, last used, expired), create with each choice, the key shown once and copied, revoke confirming in place, delete expired.
- **In the real app** (PR 2, a throwaway database, Chrome via Playwright, desktop light and phone dark):
  - create a read-only key limited to one space, and call `GET /api/people` with it;
  - check that a write gets 403;
  - revoke it, and check the next call gets 401.
