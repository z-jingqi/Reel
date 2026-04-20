import { settings } from "@reel/database";
import { availableProviders } from "@reel/ai-core";
import { modelSelectionSchema } from "@reel/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const configRouter = new Hono<AppEnv>();

const configKeySchema = z.enum(["model:writing", "model:chat", "model:default"]);

configRouter.get("/providers", (c) => {
  return c.json({ providers: availableProviders(c.env) });
});

configRouter.get("/:key", async (c) => {
  const user = c.get("user");
  const keyParse = configKeySchema.safeParse(c.req.param("key"));
  if (!keyParse.success) return c.json({ error: "invalid_key" }, 400);
  const db = getDb(c);
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, user.id), eq(settings.key, keyParse.data)))
    .limit(1);
  return c.json({ value: row?.value ?? null });
});

configRouter.put("/:key", zValidator("json", modelSelectionSchema), async (c) => {
  const user = c.get("user");
  const keyParse = configKeySchema.safeParse(c.req.param("key"));
  if (!keyParse.success) return c.json({ error: "invalid_key" }, 400);
  const value = c.req.valid("json");
  const db = getDb(c);
  await db
    .insert(settings)
    .values({ userId: user.id, key: keyParse.data, value })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value, updatedAt: new Date() },
    });
  return c.json({ value });
});
