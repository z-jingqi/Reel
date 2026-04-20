# Reel

Private journal for movies, TV shows, books, and video games, with AI writing assist.

See [`PLAN.md`](./PLAN.md) for full design.

## Prerequisites

- Node 20+
- pnpm 9+
- A Cloudflare account (for deploy; not required for local dev)

## Getting started

```bash
pnpm install

# Create local D1 binding + run migrations (server + FTS).
pnpm db:migrate:local

# Set at least one AI provider key.
cp apps/server/.dev.vars.example apps/server/.dev.vars
# then edit apps/server/.dev.vars

# Start server + web in parallel.
pnpm dev
```

- Server: http://localhost:8787
- Web: http://localhost:5173

**Bootstrap the first admin** (one-time):

```bash
# The admin key is whatever you put in apps/server/.dev.vars as ADMIN_API_KEY.
curl -X POST http://localhost:8787/api/admin/setup \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{"username":"you","password":"your-password"}'
```

**Mint an invite code** (for yourself or others to sign up through the UI):

```bash
curl -X POST http://localhost:8787/api/admin/invites \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "content-type: application/json" \
  -d '{}'
# → { "code": "…" }
```

Then visit `/sign-up` and paste the invite code, or sign in directly with the admin you just created at `/sign-in`.

## Layout

```
apps/
  web/      Vite + React + TanStack + Tailwind + Tiptap
  server/   Hono on Cloudflare Workers + Drizzle + D1
packages/
  ai-core/  Vercel AI SDK provider registry
  database/ Drizzle schema + migrations
  shared/   Zod schemas + shared types
```
