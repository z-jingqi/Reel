import { itemKindSchema } from "@reel/shared";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../env";
import { adapterForKind } from "../lookup";

export const lookupRouter = new Hono<AppEnv>();

const querySchema = z.object({ q: z.string().min(1).max(200) });

lookupRouter.get("/sources", (c) => {
  const env = c.env as unknown as Record<string, string | undefined>;
  return c.json({
    sources: {
      tmdb: Boolean(env.TMDB_API_KEY),
      google_books: true,
      rawg: Boolean(env.RAWG_API_KEY),
    },
  });
});

lookupRouter.get("/:kind", async (c) => {
  const kind = itemKindSchema.safeParse(c.req.param("kind"));
  if (!kind.success) return c.json({ error: "invalid_kind" }, 400);
  const query = querySchema.safeParse({ q: c.req.query("q") });
  if (!query.success) return c.json({ error: "missing_q" }, 400);

  const adapter = adapterForKind(kind.data);
  if (!adapter) return c.json({ candidates: [] });

  const env = c.env as unknown as Record<string, string | undefined>;
  if (!adapter.isConfigured(env)) {
    return c.json({ candidates: [], disabled: true });
  }

  try {
    const candidates = await adapter.search(env, kind.data, query.data.q);
    return c.json({ candidates });
  } catch (err) {
    console.error("lookup search failed", err);
    return c.json({ candidates: [], error: "lookup_failed" }, 502);
  }
});

lookupRouter.get("/:kind/:externalId", async (c) => {
  const kind = itemKindSchema.safeParse(c.req.param("kind"));
  if (!kind.success) return c.json({ error: "invalid_kind" }, 400);
  const externalId = c.req.param("externalId");
  if (!externalId) return c.json({ error: "missing_id" }, 400);

  const adapter = adapterForKind(kind.data);
  if (!adapter) return c.json({ error: "no_adapter" }, 404);

  const env = c.env as unknown as Record<string, string | undefined>;
  if (!adapter.isConfigured(env)) {
    return c.json({ error: "adapter_not_configured" }, 503);
  }

  try {
    const detail = await adapter.detail(env, kind.data, externalId);
    if (!detail) return c.json({ error: "not_found" }, 404);
    return c.json({ detail });
  } catch (err) {
    console.error("lookup detail failed", err);
    return c.json({ error: "lookup_failed" }, 502);
  }
});
