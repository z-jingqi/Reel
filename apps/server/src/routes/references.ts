import { referenceLinks, references } from "@reel/database";
import { referenceInputSchema } from "@reel/shared";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const referencesRouter = new Hono<AppEnv>();

referencesRouter.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c);
  const rows = await db
    .select()
    .from(references)
    .where(eq(references.userId, user.id))
    .orderBy(references.createdAt);

  const ids = rows.map((r) => r.id);
  const links = ids.length
    ? await db.select().from(referenceLinks).where(inArray(referenceLinks.referenceId, ids))
    : [];

  const byRef = new Map<number, typeof links>();
  for (const link of links) {
    const list = byRef.get(link.referenceId) ?? [];
    list.push(link);
    byRef.set(link.referenceId, list);
  }
  return c.json({
    references: rows.map((r) => ({ ...r, links: byRef.get(r.id) ?? [] })),
  });
});

referencesRouter.post("/", zValidator("json", referenceInputSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const db = getDb(c);
  const [row] = await db
    .insert(references)
    .values({ userId: user.id, title: input.title, note: input.note ?? null })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);
  if (input.links.length) {
    await db.insert(referenceLinks).values(
      input.links.map((link, i) => ({
        referenceId: row.id,
        url: link.url,
        label: link.label ?? null,
        position: i,
      })),
    );
  }
  return c.json({ reference: row }, 201);
});

referencesRouter.patch(
  "/:id{[0-9]+}",
  zValidator("json", referenceInputSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const input = c.req.valid("json");
    const db = getDb(c);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updates.title = input.title;
    if (input.note !== undefined) updates.note = input.note;

    const [row] = await db
      .update(references)
      .set(updates)
      .where(and(eq(references.id, id), eq(references.userId, user.id)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);

    if (input.links) {
      await db.delete(referenceLinks).where(eq(referenceLinks.referenceId, id));
      if (input.links.length) {
        await db.insert(referenceLinks).values(
          input.links.map((link, i) => ({
            referenceId: id,
            url: link.url,
            label: link.label ?? null,
            position: i,
          })),
        );
      }
    }

    return c.json({ reference: row });
  },
);

referencesRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  await db
    .delete(references)
    .where(and(eq(references.id, id), eq(references.userId, user.id)));
  return c.body(null, 204);
});
