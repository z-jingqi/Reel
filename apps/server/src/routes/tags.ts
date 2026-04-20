import { tags } from "@reel/database";
import { slugify, tagInputSchema } from "@reel/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const tagsRouter = new Hono<AppEnv>();

tagsRouter.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c);
  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.userId, user.id))
    .orderBy(tags.name);
  return c.json({ tags: rows });
});

tagsRouter.post("/", zValidator("json", tagInputSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const slug = input.slug?.trim() || slugify(input.name) || `tag-${Date.now()}`;
  const db = getDb(c);
  const [row] = await db
    .insert(tags)
    .values({ userId: user.id, name: input.name, slug })
    .returning();
  return c.json({ tag: row }, 201);
});

tagsRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  await db.delete(tags).where(and(eq(tags.id, id), eq(tags.userId, user.id)));
  return c.body(null, 204);
});
