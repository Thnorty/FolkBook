# FolkBook — TODO

## Decisions so far
- [x] Personal CRM for keeping track of people you know (relatives, friends, event contacts, work/school)
- [x] Headline feature: remembering details about people (memory aids, notes)
- [x] Self-hosted: backend + frontend shipped as Docker container(s)
- [x] Responsive UI for both mobile and desktop
- [x] UI designed in Claude Design, then implemented in code
- [x] AI features use the user's own API key (Gemini or any OpenAI-compatible provider)
- [x] Meant to be a product for other people, with a way to make money
- [x] NOT local-first: self-hosted server, no offline support needed
- [x] Contact import via .vcf (vCard) files
- [x] AI only suggests people/links; user edits suggestions before confirming
- [x] "Me" is a node in the graph

## Open questions
- [ ] How to make money (see monetization notes below)
- [x] Frontend libraries (see Tech stack)
- [x] UI design theme: warm notebook (see docs/UI_FLOWS.md)
- [ ] Design screens in Claude Design based on docs/UI_FLOWS.md
  - [x] Round 1: design system, person profile, Today (design/FolkBook.dc.html)
  - [x] Round 2: add person, quick capture + review, add/end connection, log interaction
  - [x] Round 2 fixes
  - [x] Round 3: graph + family tree
    - Reagraph notes (checked against docs): `labelFontUrl` needs .ttf/.woff (not .woff2); `clusterAttribute` works only with force layouts; animation is switched off automatically above 400 nodes+edges; `collapsedNodeIds` collapses a node's children, so folded-space bubbles will be synthetic nodes we build ourselves; the hop-by-hop ink path animation needs our own overlay or edge updates
  - [x] Round 4: spaces, sharing, import, search
  - [x] Round 5: auth, settings, email, dark mode, empty states, motion spec
  - [x] Round 6: final fixes + password reset (7a–7d)
  - [x] Members CAN create invite links (for spaces they own), as designed in 5v
  - [x] API keys can include private notes/memory aids/timeline: opt-in per key, off by default
  - [x] Memory aids in reminder emails: on by default, setting to turn off
  - [x] Design phase complete (design/FolkBook.dc.html, turns 1–7)
- [x] Contact details (phone, email) NOT shared in shared spaces by default; per-space toggle
- [ ] Implementation note: "We talked" links in emails must open a confirm page, never log on a plain GET (email scanners pre-open links)
- [ ] Resolve open questions at the bottom of docs/UI_FLOWS.md

## Implementation plan
- [x] Step 1: repo setup: git, AGENTS.md, Docker Compose (Postgres + Django/Ninja + Caddy serving the Vite app), health endpoint, tests and linters
- [ ] Move TODOs to GitHub Issues + Projects board
- [ ] Step 2: data model + API (users, spaces, people, relationships, memory aids, interactions), privacy rules tested first
- [ ] Step 3: frontend foundation: design tokens → Tailwind + shadcn/ui, app shell (sidebar / bottom tabs), generated API client
- [ ] Step 4: screens in order: person profile → People → Add person → Today → Graph → the rest

## Tech stack
- [x] Database: PostgreSQL (graph queries via recursive SQL, no separate graph DB)
- [x] Backend: Django
- [x] Deployment: Docker Compose
- [x] Frontend: React (open to alternatives)
- [x] Django Ninja for the API (auto OpenAPI); Django admin for server admins
- [x] Vite + React + TypeScript single-page app (no Next.js; Django is the backend)
- [x] Tailwind + shadcn/ui components; Motion for animations
- [x] TanStack Query + typed API client generated from the OpenAPI spec
- [x] Reagraph for the graph view (fallback: Sigma.js + graphology)
- [x] Installable PWA for the phone home-screen experience
- [x] Caddy as reverse proxy (serves frontend, automatic HTTPS)
- [ ] Background worker for email digests + AI calls (choose before building nudges)
- [ ] License (e.g. AGPL vs. MIT)

## Core data model
- [ ] **Person**: name, photo, how we met, notes, birthday, contact info, tags
- [ ] **Context/Group**: school, work, event, family. A person can belong to MANY contexts
- [ ] **Relationship**: an edge between any two people (not only "me → them")
  - [ ] Has a type, an optional start/end date, and a status (current/former)
  - [ ] Store only primitive family edges (parent, partner); derive the rest (sibling, cousin, in-law) at query time
  - [ ] Parent subtypes: biological / adoptive / step
  - [x] Direct family links ("other family": sibling, cousin, grandparent, grandchild, aunt/uncle, niece/nephew) for when the connecting people are unknown; superseded once the chain can be derived
  - [ ] Divorce = end the partner edge; derived in-laws update automatically (shown as "former" or hidden)
- [ ] **Interaction**: timeline entries per person (met, called, coffee…)
- [ ] **Memory aids**: structured "remember this" facts (kids' names, allergies, favorite team…)

## Multi-user & spaces
- [x] Spaces model agreed
- [x] Invite-only accounts (admins create invite links; members can create links for spaces they own)
- [x] Spaces and contexts MERGED: a space is a group of people; private spaces act as the old "contexts"
- [ ] A person can be in many spaces
- [ ] Being in a space (as a person) is separate from having access to it (as a user)
- [ ] Paths can cross shared spaces (me → Defne → people in Defne's space)
- [x] Ownership: each person record has one owner; others see it by REFERENCE through shared spaces (always the owner's latest version)
- [ ] If access is revoked, you keep a copy of referenced people with your own notes
- [ ] Relationships have an owner + a space; visible only if you can see THAT space (seeing both people isn't enough)
- [ ] Sharing a space shows only its people's basic profile + that space's links; never private notes, memory aids, or links from other spaces
- [ ] Clear "shared" indicator + first-time confirmation when adding someone to a shared space ("Tom will be visible to 4 people")
- [ ] Later: search / favorites / nested spaces for users with many spaces
- [ ] Access roles on a space: owner / editor / viewer
- [ ] Each user has ONE "Me" node (others see only its public profile: name, photo)
- [ ] Notes, memory aids AND interactions (timeline) stay private per user, even on shared people
- [ ] Keyboard: N = Add person, Shift+N = Quick capture, Ctrl/Cmd+K = command palette
- [ ] Derived relations are computed relative to the viewer's "Me"
- [ ] Later: link two person records as the "same person"

## Features backlog
### MVP
- [ ] People CRUD with notes and memory aids
- [ ] Contexts/groups (many-to-many)
- [ ] Relationships between people
- [ ] Search
- [ ] Graph view (basic)
- [ ] Docker packaging

### Next
- [ ] Graph exploration: "how do I know X?" path finding, filter by context, clusters
- [ ] Family tree mode with derived relations
- [ ] Interaction timeline
- [ ] Keep-in-touch nudges (can be turned on/off globally and per person)
- [ ] Import contacts (vCard first) + fill in details during import

### Profile photos
- [ ] Upload + crop, generate thumbnails
- [ ] Stored in a Docker volume; included in backups
- [ ] Import photos from .vcf when present

### Public API
- [ ] API-first: the frontend uses the same API as users
- [ ] Personal API keys: create, name, set expiry, revoke; shown once, stored hashed
- [ ] Scopes: read-only / read-write, optionally limited to specific spaces
- [ ] "Last used" timestamp per key
- [ ] REST endpoints for people, relationships, contexts, interactions, memory aids
- [ ] OpenAPI spec + interactive docs page
- [ ] Rate limiting
- [ ] Later: webhooks (e.g. "person created")
- [ ] Later: MCP server so users can ask an AI assistant about their own contacts

### Backups
- [ ] Export everything (JSON + photos) and restore
- [ ] Export to .vcf

### Email (reminders)
- [x] Reminders by email only (no push/voice); Today cards in-app always work
- [ ] SMTP config via env vars or admin settings page; "Send test email"
- [ ] Hosted (paid) version: our transactional email provider, same SMTP code path
- [ ] Digest emails (daily or weekly) instead of one email per person
- [ ] Unsubscribe link in every email; per-user email preferences
- [ ] Password reset by email when SMTP is set; otherwise admin resets passwords
- [ ] Docs: recommend a relay provider for self-hosters (home servers often land in spam)
- [ ] Background worker + scheduler to send digests (needed now, choose one)

### AI (bring your own key)
- [ ] Settings: provider (Gemini / OpenAI-compatible base URL), API key, model
- [ ] Quick capture: free text → people + relationships + tags, reviewed by the user before saving
- [ ] Local model support via OpenAI-compatible endpoint (Ollama, LM Studio)

## Monetization ideas
- [ ] Free self-hosted open-source version
- [ ] Paid managed hosting / sync for people who don't want to run Docker
- [ ] Possibly paid "supporter" license or pro features
