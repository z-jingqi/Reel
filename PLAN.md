# Reel — Plan

Personal journal for logging movies, TV shows, books, and video games, plus writing linked articles with AI assistance. Multi-user (MVP starts with one account, but the data model, auth, and APIs are multi-tenant from day one). Deployed on Cloudflare.

## Scope

- **In**: auth (username + password, invite-only), log items, per-season tracking for TV, ratings/status, structured credits (person + role), reusable references with 0..N links, rich-text articles linking 0..N items and 0..N references, categories + tags, AI writing assistant, AI chat over an article and its linked items, per-user memories (writing style, etc.).
- **Out (MVP)**: social features, auto-fill from external APIs, quotes/highlights, article versioning, embedded uploads, item-to-item relations, re-consumption sessions, AI chat persistence, password reset, email anything.
- **Deferred**: Cloudflare Access, TMDB/OpenLibrary/IGDB auto-fill, R2 image uploads, franchise grouping, OAuth providers, email verification.

## Tech stack

| Layer | Choice |
| --- | --- |
| Monorepo | pnpm workspaces + Turbo |
| Server | Hono on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM |
| Search | SQLite FTS5 virtual tables |
| Web | Vite + React 19 + TypeScript |
| Routing / data | TanStack Router + TanStack Query |
| Styling | Tailwind CSS v4 |
| Editor | Tiptap (ProseMirror) — store `body_json` |
| AI | Vercel AI SDK (multi-provider registry) |
| Auth | Roll-your-own: PBKDF2 + session cookies (mirrors AI-Chart) |
| Deploy | Cloudflare Workers (server) + Cloudflare Pages (web) |

AI providers supported from day one (mirrors AI-Chart): Anthropic, OpenAI, Google, DeepSeek, OpenRouter, Cloudflare Workers AI. Provider + model selected at runtime, persisted per-user in `settings`.

## Repo layout

```
Reel/
  apps/
    web/          Vite + React + TanStack + Tailwind + Tiptap
    server/       Hono + Drizzle on Cloudflare Workers
  packages/
    ai-core/      Vercel AI SDK provider registry
    database/     Drizzle schema + migrations
    shared/       Zod schemas + shared types
  PLAN.md
  README.md
  package.json
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
```

## Data model

All timestamps are stored as Unix epoch ms (SQLite integers). Every user-ownable top-level entity carries `user_id` FK; children inherit ownership through parents.

### users
- `id` PK (nanoid / hex text)
- `username` UNIQUE
- `password_hash`, `salt` — PBKDF2-SHA256, 100k iterations, 256-bit output
- `role` enum: `admin | user`
- `created_at`, `updated_at`

### sessions
- `id` PK (64-char random hex, also the cookie value)
- `user_id` FK → users (cascade delete)
- `expires_at`, `last_active_at`, `created_at`
- Cookie: `reel_session`, httpOnly + SameSite=Lax + (Secure in prod), 30-day expiry, sliding.

### invite_codes
- `id` PK, `code` UNIQUE
- `created_by` FK → users
- `used_by` FK → users (null until redeemed), `used_at`, `expires_at?`
- First signup (when users table is empty) is admin and doesn't need a code. All later signups require a valid unused, unexpired code.

### items
- `id` PK, `user_id` FK → users
- `kind` enum: `movie | tv | book | game`
- `title`, `year?`, `rating?` 1..10
- `status` enum: `wishlist | active | finished | dropped | paused`
- `notes?`, `cover_url?`, `external_ids` JSON, `completed_at?`
- `created_at`, `updated_at`

### seasons (TV only — ownership via items)
- `id` PK, `item_id` FK (cascade)
- `number`, `title?`, `year?`, `rating?`, `status`, `notes?`, `completed_at?`
- `created_at`, `updated_at`
- UNIQUE `(item_id, number)`

### people (per-user)
- `id` PK, `user_id` FK
- `name`, `kind` enum: `person | studio`, `external_ids` JSON

### item_credits (ownership via items)
- `id` PK, `item_id` FK (cascade), `person_id` FK (restrict)
- `role` TEXT, `character?`, `position` INTEGER

### articles
- `id` PK, `user_id` FK
- `slug`, `title`, `body_json`, `body_text`, `pinned`
- `created_at`, `updated_at`
- UNIQUE `(user_id, slug)`

### article_items, article_categories, article_tags (join tables — ownership via article)
- `(article_id, *)` composite PKs.

### categories (per-user)
- `id` PK, `user_id` FK, `name`, `slug`
- UNIQUE `(user_id, slug)` and `(user_id, name)`

### references (per-user)
- `id` PK, `user_id` FK, `title`, `note?`, `created_at`, `updated_at`

### reference_links (ownership via references)
- `id` PK, `reference_id` FK (cascade), `url`, `label?`, `position`

### article_refs (ownership via article)
- `id` PK, `article_id` FK (cascade), `reference_id` FK (restrict), `position`

### tags (per-user)
- `id` PK, `user_id` FK, `name`, `slug`
- UNIQUE `(user_id, slug)` and `(user_id, name)`

### item_tags, article_tags (ownership via parent)
- Composite PKs.

### settings
- PK `(user_id, key)`, `value` JSON, `updated_at`
- Runtime config only: e.g., `model:writing`, `model:chat`, `model:default`.
- No memory content here.

### memories (the dedicated memory table)
- `id` PK, `user_id` FK, `kind` TEXT (e.g., `style_writing`, `style_about`), `content` TEXT, `updated_at`
- UNIQUE `(user_id, kind)`
- Future kinds can be added without schema change.

### FTS5 virtual tables
- `items_fts` over `items.title`, `items.notes`
- `articles_fts` over `articles.title`, `articles.body_text`
- FTS tables are global; scope by joining back to the owner's `user_id` at query time.

## Display rules

- Primary creator per `items.kind` is computed from `item_credits` by role priority:
  - `movie`: director → writer
  - `tv`: creator → showrunner → writer
  - `book`: author → writer
  - `game`: developer → director
- No denormalized `creator` column.

## Auth flow

- **Signup** (`POST /api/auth/signup`): always requires a valid `inviteCode`. Creates user, consumes invite, creates session, sets cookie, returns `{ user }`.
- **Signin** (`POST /api/auth/signin`): verifies password (constant-time), creates session, sets cookie.
- **Signout** (`POST /api/auth/signout`): deletes session row, clears cookie.
- **Me** (`GET /api/auth/me`): returns `{ user }` from session.
- **Admin API** (`/api/admin/*`): gated by `Authorization: Bearer <ADMIN_API_KEY>` (env secret). Endpoints:
  - `POST /api/admin/setup` — create an admin user (username + password). Works at any time (you can create multiple admins). This is how the first user is bootstrapped.
  - `POST /api/admin/invites` — mint an invite code.
  - `GET /api/admin/invites` — list invite codes.
- Middleware on all `/api/*` except `/api/auth/*`, `/api/admin/*`, and `/api/health` enforces a valid session; sets `c.var.user`.
- Every CRUD handler passes `c.var.user.id` into both read WHERE clauses and insert values.

## AI pattern (from AI-Chart)

- `packages/ai-core/src/registry.ts` — `getModelInstance(provider, modelId)` switch over supported providers, returns a Vercel AI SDK `LanguageModel`.
- `packages/ai-core/src/config.ts` — resolves `{provider, modelId}` from:
  1. `settings (user_id, key)` override, keyed per feature (`model:writing`, `model:chat`, `model:default`)
  2. Environment fallback (`DEFAULT_PROVIDER`, `*_API_KEY`)
- Server routes stream with `streamText()`.
- Features:
  - **Writing assist** — continue, rewrite, summarize, suggest title/tags. Context = article draft + selection + linked items.
  - **Chat over article** — article body + linked items + linked references. Ephemeral in MVP.
  - **Memory injection** — before each call, load the user's `style_writing` memory and prepend it to the system prompt.
  - **Memory synthesis** — `POST /api/memories/analyze` reads the user's recent articles, asks the model to write a 150–300 word style profile, stores it as `style_writing` memory.
  - Deferred: `style_about`, per-category style, few-shot exemplars, RAG over past articles.

## MVP milestones

1. **Scaffold** — monorepo, packages, apps, dev scripts.
2. **DB up** — `wrangler d1 create reel`, run initial migration, first user registers (no invite).
3. **Auth e2e** — signup, signin, signout, me; route guard + middleware; admin can mint invites.
4. **Items CRUD** — server endpoints + web list/detail/create/edit pages. Tags + credits working. User-scoped.
5. **TV seasons** — nested under an item.
6. **Articles CRUD** — Tiptap editor, save JSON + extracted text. Link items + categories + tags.
7. **References** — standalone CRUD + article citation flow (`article_refs`).
8. **Search** — FTS5 over items and articles, single search page.
9. **AI writing assist** — slash-menu in editor, streaming.
10. **Memories** — `memories` CRUD + "Analyze my writing" button. Auto-injected into writing/chat system prompts.
11. **AI chat over article** — side panel, streaming.
12. **Settings** — provider/model pickers backed by `settings`.
13. **Deploy** — Workers (server) + Pages (web), D1 bound.

## Non-goals for MVP

- No password reset / email recovery (roll DB if you lock yourself out).
- No sharing, no public URLs.
- No offline mode, no PWA install.
- No mobile-specific UI (responsive is enough).
- No telemetry.
