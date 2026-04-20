import { items, seasons } from "@reel/database";
import { seasonInputSchema } from "@reel/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const seasonsRouter = new Hono<AppEnv>();

async function assertItemOwned(
  c: Parameters<typeof getDb>[0],
  itemId: number,
  userId: string,
): Promise<boolean> {
  const db = getDb(c);
  const [row] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .limit(1);
  return Boolean(row);
}

async function assertSeasonOwned(
  c: Parameters<typeof getDb>[0],
  seasonId: number,
  userId: string,
): Promise<boolean> {
  const db = getDb(c);
  const [row] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .innerJoin(items, eq(items.id, seasons.itemId))
    .where(and(eq(seasons.id, seasonId), eq(items.userId, userId)))
    .limit(1);
  return Boolean(row);
}

seasonsRouter.get("/", async (c) => {
  const user = c.get("user");
  const itemId = Number(c.req.query("itemId"));
  if (!itemId) return c.json({ error: "itemId required" }, 400);
  if (!(await assertItemOwned(c, itemId, user.id))) return c.json({ error: "not_found" }, 404);
  const db = getDb(c);
  const rows = await db
    .select()
    .from(seasons)
    .where(eq(seasons.itemId, itemId))
    .orderBy(seasons.number);
  return c.json({ seasons: rows });
});

seasonsRouter.post("/", zValidator("json", seasonInputSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  if (!(await assertItemOwned(c, input.itemId, user.id))) {
    return c.json({ error: "forbidden" }, 403);
  }
  const db = getDb(c);
  const [row] = await db.insert(seasons).values(input).returning();
  return c.json({ season: row }, 201);
});

seasonsRouter.patch("/:id{[0-9]+}", zValidator("json", seasonInputSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!(await assertSeasonOwned(c, id, user.id))) return c.json({ error: "not_found" }, 404);
  const input = c.req.valid("json");
  const db = getDb(c);
  const [row] = await db
    .update(seasons)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(seasons.id, id))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ season: row });
});

seasonsRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!(await assertSeasonOwned(c, id, user.id))) return c.json({ error: "not_found" }, 404);
  const db = getDb(c);
  await db.delete(seasons).where(eq(seasons.id, id));
  return c.body(null, 204);
});
