# Import contacts from .vcf, fill in the blanks, undo an import

Issue: [#33](https://github.com/Thnorty/FolkBook/issues/33), including the "undo a bad import" idea in its comment.
Design: `design/FolkBook.dc.html`, screens 4p–4w.

## Goal

Bring people in from a phone or Google Contacts without filling the book with everyone the phone knows. The user picks who they actually know, deals with the ones already in the book, optionally puts them in a space, and then says how they know each one, card by card. A bad import can be undone without losing anything the user wrote since.

## Delivery

One spec, three PRs, each usable on its own:

1. **Import:** reading the file, duplicates and merging, the 5-step wizard. It already records which import added whom.
2. **Fill in the blanks:** the card mode.
3. **Recent imports and undo.**

## 1. Reading the file

A new backend app, `imports` (`vcard.py` reader, `models.py`, `services.py`, `api.py`, `schemas.py`).

**Our own reader, no new dependency.** `vobject` handles vCard 2.1 poorly, and older Android phones export 2.1 with quoted-printable names (common for Turkish names). The reader handles 2.1, 3.0 and 4.0:

- line unfolding (a line starting with a space or tab continues the previous one), and the 2.1 quoted-printable soft line break (`=` at the end of a line);
- `ENCODING=QUOTED-PRINTABLE` with `CHARSET` (UTF-8 if none);
- escaped `\,` `\;` `\n` `\\`;
- property groups (`item1.TEL`), and both parameter styles (`TEL;CELL;VOICE` and `TEL;TYPE=cell,voice`);
- photos as base64 (`ENCODING=b`, `ENCODING=BASE64`, 4.0 `data:` URIs).

**What it reads per contact:**

| vCard | FolkBook |
|---|---|
| `FN`, or else `N` (given + family), or else `ORG` (business contacts) | name |
| `TEL` | phone; label from the type: cell → "mobile", home, work |
| `EMAIL` | email; label home or work |
| `BDAY`: `YYYY-MM-DD`, `YYYYMMDD`, `--MMDD`, `--MM-DD`; year 1604 or `X-APPLE-OMIT-YEAR` means no year | birthday |
| `ORG` and `TITLE` | work ("Title, Company") |
| `PHOTO` (embedded only) | photo, through `people.services.store_photo` |
| `NOTE` | the user's private note on the person |

Everything else (addresses, websites, social profiles) is left out. A contact with no name at all is skipped and counted. Text is cut to the field's length. Invalid birthdays are dropped, not refused.

**Never fetched:** a `PHOTO` given as a URL is ignored. The server never downloads anything a file points to.

**Limits:** 20 MB per file, 5,000 contacts, each photo at most `photos.MAX_BYTES`. A file that isn't a vCard gives 422, "That file isn't a .vcf contacts file."

## 2. Duplicates and merging

Each contact is compared with `visible_people(access)` (never anything the user can't see), and the best match is kept, with its reason:

| Reason | Rule | Sure? |
|---|---|---|
| Same phone number | digits only, last 9 digits equal | yes |
| Same email | equal ignoring case | yes |
| Same name | equal ignoring case and accents (as search does) | yes |
| Same first name and initial | same first word; one side's last word is an initial (`K.`) matching the other's last-word initial | maybe |

Matching runs in a constant number of queries: the user's people with their phones and emails are loaded once and compared in Python.

**Choose step:** contacts with a match carry "Maybe in your book". "Hide N already in your book" hides the contacts whose phone or email matches someone (the sure, contact-detail matches).

**Merge is offered only for the user's own people** (`can_edit_person` plus ownership, because contact details are owner-only). For someone shared with the user, the choices are Skip or Import as new, with "Shared by {owner}, so you can't merge into them".

**Merge never overwrites anything:**

- it keeps the person and their name;
- it adds phones and emails they don't have yet (compared the same way as matching);
- it fills empty fields only (work, birthday, photo);
- the contact's note is appended to the user's note (after a blank line), or becomes it.

## 3. The wizard (PR 1)

**Route** `/people/import`, a child of `appRoute`. It opens from Settings → Import / export (a new "Import contacts (.vcf)" row above Export) and from onboarding's optional "import contacts" step. On a phone it's full screen with Back and Next at the top, and the duplicate question is a sheet from the bottom (4u).

**API (nothing is stored until the last call):**

- `POST /api/imports/preview` (multipart `file`) returns:
  - `file_name`;
  - `contacts`, each with `index`, `name`, `phones`, `emails`, `birthday`, `work`, `has_photo` and `match`. `match` is `{person: {id, name, owner, photo}, reason, sure, can_merge}` or null.
  - `skipped`: contacts with no name.

  This is one response, not a paginated list: it describes one file (5,000 contacts at most), not a resource.
- `POST /api/imports` (multipart `file`, `choices` JSON: `{"picked": [{"index", "action": "new" | "merge" | "skip", "into"?}], "space"?: id}`):
  - reads the file again and checks every choice: the index exists, `into` is the contact's match and mergeable, and the user can add people to the space (`can_change_space_people`; the new people are their own);
  - then, in one transaction, creates the `Import`, the new people (in the space, if one was picked) and the merges;
  - returns `{import_id, added, merged, left_out, space}`.
  - Errors: a bad choice is 422, a space you can't add to is 403.

**Steps** (stepper: Upload · Choose · Duplicates · Space · Done):

1. **Upload:** a drop zone or "choose a file", with the hints for phones and Google Contacts, and "Nothing is added until the last step".
2. **Choose:** "{N} contacts in {file}. Select who you actually know." Nothing is ticked at first. A search box, "Hide N already in your book", and "Continue with N". A list of up to 5,000 rows is fine to render as is.
3. **Duplicates:** the picked contacts with a match, one at a time: "Looks like {name} already exists", the reason, both sides compared, and the details a merge would add highlighted. **Merge / Skip / Import as new.** This step is left out when there are no matches.
4. **Space:** "Put the {N} new people in a space?" Chips for the spaces the user can add people to, plus "No space". Picking a shared space shows `SharedSpaceConfirm`. Merged people keep their own spaces.
5. **Done:** "Imported {N} new people, in {space} · {M} merged into … · {K} left out (they stay in your phone)". Then **Later** (to People) or **Fill in the blanks →** (PR 2; until it ships, "Show them" opens the Needs details filter).

**Data:** a new `Import` model (`owner`, `file_name`, `created_at`, `undone_at` null), and a nullable `Person.added_by_import` (FK, `SET_NULL`). Merges are recorded so undo can reverse them (decided after the first review of this spec): a `Merge` row per merge (`batch`, `person`, `filled`: the fields it filled in with their values, `note`: the text it added to the user's note), and a nullable `ContactMethod.added_by_import` on the phones and emails it added. Migrations in `imports` and `people`.

**Docs:** `UI_FLOWS.md` §3.6 drops the "continue enriching later" reminder on Today, because the design (4t) uses the Needs details filter instead. `DECISIONS.md` gets an "Import (.vcf)" entry.

## 4. Fill in the blanks (PR 2)

**Route** `/people/fill-in`, with an optional `?import={id}`. It opens from the Done step (that import's people) and from a "Fill in the blanks" button on the People page's **Needs details** filter (everyone without "how we met").

**Queue:** `GET /api/people?needs_details=true&import={id}`, a new `import` filter that only matches the user's own imports. It's read once when the mode opens, so saved people don't vanish from the list on the left.

**The card** (4v, 4w):

- the photo or initials, the name, and "From {file} · {first phone or email}";
- **"How do you know {first name}?"**, which saves `how_we_met`;
- **chips** for up to 4 spaces the user can add people to, those with the most people first, each with its color. Shared spaces have the shared icon, and the first time a shared one is picked, `SharedSpaceConfirm` appears. Picking a chip toggles that space;
- **"Friend of…"**: a person picker, which adds a friend link (`useConnectionForm` rules, saved through the existing relationship endpoint);
- **"+ add a memory aid"**: an inline field, saved with the existing endpoint.

**Moving on:**

- **Save & next** (Ctrl/⌘+Enter) and **Skip** (Ctrl/⌘+→); keys 1–5 pick a chip when no text field has focus.
- On a phone, swipe right to save and left to skip, with the buttons as well. With reduced motion there is no swipe animation, only a 150 ms fade.
- On a desktop, a list on the left marks each person done, now or next, with **Finish later**.
- At the end: "All done", and back to where the mode was opened.

**Saving** uses the existing endpoints (`PATCH /api/people/{id}`, the space and relationship endpoints, memory aids). There's no new write endpoint.

## 5. Recent imports and undo (PR 3)

**Settings → Import / export → Recent imports:** the user's last 5 imports, for example "contacts.vcf · 8 Oct · 5 people added" (or "undone").

- **Show these people** opens People filtered to that import (`?import={id}`), with a chip "From contacts.vcf" that can be cleared.
- **Undo this import** opens a confirmation:
  - who goes ("5 people");
  - who stays: "2 you've written about since stay", meaning people with a note, memory aid, timeline entry, keep-in-touch or link by the user created after the import (notes added by the import itself don't count);
  - then the same soft delete as tear out (`delete_person` for each, inside `keeping_copies` like any ending of access), with the 10-second Undo that brings them all back. The `Import` gets `undone_at`.
  - merges are reversed too: the phones and emails the import added are removed; fields it filled in are emptied again if they still hold the imported value; a photo it added is removed if it's still the photo; the note text it added is taken off the end of the user's note if it's still there (the note goes if nothing else is left). Anything changed since stays as it is, and the confirmation says how many people get details taken back ("2 people you had lose the details this import added").
- **API:** `GET /api/imports` (paginated, the user's own), `GET /api/imports/{id}/undo-preview`, `POST /api/imports/{id}/undo`, `POST /api/imports/{id}/redo` (the toast's Undo).
- **Policy:** `visible_imports(access)` (own imports only; others are 404) and `can_undo_import(access, imp)` (read-write, full access).

## Errors and edge cases

- The whole import is one transaction; photo files written before a failure are deleted (as in restore).
- The same file imported twice: the second time, everyone already imported matches "Same phone number" or "Same email" and is hidden by "Hide N already in your book".
- A contact that matches someone the user has torn out (deleted, in the undo window) isn't matched: `visible_people` leaves them out.
- A merge target deleted between preview and import: 422, "{name} isn't in your book any more; go back and choose again."

## Tests

- **Reader:** table-driven tests:
  - vCard 2.1 with quoted-printable UTF-8 Turkish names and soft line breaks;
  - 3.0 from an iPhone (grouped lines, `X-APPLE-OMIT-YEAR`, base64 photo) and 4.0 from Google (`data:` photo);
  - folded lines, escapes, `--MMDD` birthdays, no name, URL photos ignored;
  - not a vCard, and the limits.
- **Duplicates:** each rule and its reason; a shared person can't be merged into; people the user can't see never match; merge adds only what's missing and never overwrites; the query count doesn't grow with the file.
- **Import:** one transaction, with nothing left behind on failure; every choice checked (unknown index, `into` that isn't the match, a space the user can't add to); 401, and limited API keys; `added_by_import` set only on people it added.
- **Fill in the blanks:** the `import` filter only works on the user's own imports; the card's keys, chips (including the shared-space confirmation), Friend of…, and the swipe with and without reduced motion.
- **Undo:** people the user wrote about since stay; merges are reversed except what was changed since; `keeping_copies` runs; redo brings everyone back; another user's import is 404.
- **In the real app** (a throwaway database, Chrome via a Playwright script, desktop light and phone dark), as for restore: import a sample .vcf, merge one duplicate, put people in a space, fill in one card, undo the import. The repo has no committed end-to-end suite yet; setting one up is out of scope here.
