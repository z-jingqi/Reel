import { categories } from "@reel/database";
import { categoryInputSchema, slugify } from "@reel/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const categoriesRouter = new Hono<AppEnv>();

categoriesRouter.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c);
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, user.id))
    .orderBy(categories.name);
  return c.json({ categories: rows });
});

categoriesRouter.post("/", zValidator("json", categoryInputSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const slug = input.slug?.trim() || slugify(input.name) || `category-${Date.now()}`;
  const db = getDb(c);
  const [row] = await db
    .insert(categories)
    .values({ userId: user.id, name: input.name, slug })
    .returning();
  return c.json({ category: row }, 201);
});

categoriesRouter.patch(
  "/:id{[0-9]+}",
  zValidator("json", categoryInputSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const input = c.req.valid("json");
    const db = getDb(c);
    const [row] = await db
      .update(categories)
      .set(input)
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ category: row });
  },
);

categoriesRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, user.id)));
  return c.body(null, 204);
});
