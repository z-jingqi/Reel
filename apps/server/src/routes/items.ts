import {
  itemCredits,
  itemTags,
  items,
  people,
  tags,
  type Person,
} from "@reel/database";
import {
  creditInlineSchema,
  type CreditInline,
  itemInputSchema,
} from "@reel/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const itemsRouter = new Hono<AppEnv>();

itemsRouter.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c);
  const rows = await db
    .select()
    .from(items)
    .where(eq(items.userId, user.id))
    .orderBy(items.createdAt);
  return c.json({ items: rows });
});

itemsRouter.get("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  const [row] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, user.id)))
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);

  const [credits, tagRows] = await Promise.all([
    db
      .select({
        id: itemCredits.id,
        role: itemCredits.role,
        character: itemCredits.character,
        position: itemCredits.position,
        personId: people.id,
        personName: people.name,
        personKind: people.kind,
      })
      .from(itemCredits)
      .innerJoin(people, eq(people.id, itemCredits.personId))
      .where(eq(itemCredits.itemId, id))
      .orderBy(itemCredits.position),
    db.select({ tagId: itemTags.tagId }).from(itemTags).where(eq(itemTags.itemId, id)),
  ]);

  return c.json({
    item: row,
    credits,
    tagIds: tagRows.map((r) => r.tagId),
  });
});

itemsRouter.post("/", zValidator("json", itemInputSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const db = getDb(c);

  const { credits: inlineCredits = [], ...fields } = input;

  const [row] = await db
    .insert(items)
    .values({ ...fields, userId: user.id })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);

  if (inlineCredits.length) {
    await attachCredits(c, user.id, row.id, inlineCredits);
  }

  return c.json({ item: row }, 201);
});

const patchBodySchema = itemInputSchema
  .partial()
  .extend({
    tagIds: z.array(z.number().int()).optional(),
  });

itemsRouter.patch("/:id{[0-9]+}", zValidator("json", patchBodySchema), async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const input = c.req.valid("json");
  const db = getDb(c);

  const { credits: _credits, tagIds, ...fields } = input;
  void _credits;

  // Verify ownership first.
  const [owned] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, id), eq(items.userId, user.id)))
    .limit(1);
  if (!owned) return c.json({ error: "not_found" }, 404);

  let row = null as typeof items.$inferSelect | null;
  if (Object.keys(fields).length) {
    const [updated] = await db
      .update(items)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(items.id, id), eq(items.userId, user.id)))
      .returning();
    row = updated ?? null;
  } else {
    const [existing] = await db.select().from(items).where(eq(items.id, id)).limit(1);
    row = existing ?? null;
  }

  if (tagIds) {
    // Verify all provided tag ids belong to the user.
    if (tagIds.length) {
      const ownedTags = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(inArray(tags.id, tagIds), eq(tags.userId, user.id)));
      if (ownedTags.length !== tagIds.length) return c.json({ error: "tag_not_owned" }, 400);
    }
    await db.delete(itemTags).where(eq(itemTags.itemId, id));
    if (tagIds.length) {
      await db.insert(itemTags).values(tagIds.map((tagId) => ({ itemId: id, tagId })));
    }
  }

  return c.json({ item: row });
});

itemsRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  await db.delete(items).where(and(eq(items.id, id), eq(items.userId, user.id)));
  return c.body(null, 204);
});

// ---- credits management on an item ----

itemsRouter.post(
  "/:id{[0-9]+}/credits",
  zValidator("json", creditInlineSchema),
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const input = c.req.valid("json");
    const db = getDb(c);

    const [owned] = await db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.id, id), eq(items.userId, user.id)))
      .limit(1);
    if (!owned) return c.json({ error: "not_found" }, 404);

    const personId = await upsertPerson(c, user.id, input);
    if (personId == null) return c.json({ error: "upsert_failed" }, 500);

    const [existingMax] = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${itemCredits.position}), -1)`.as("maxPos") })
      .from(itemCredits)
      .where(eq(itemCredits.itemId, id));
    const position = Number(existingMax?.maxPos ?? -1) + 1;

    const [inserted] = await db
      .insert(itemCredits)
      .values({
        itemId: id,
        personId,
        role: input.role,
        character: input.character ?? null,
        position,
      })
      .returning();
    return c.json(
      {
        credit: {
          id: inserted!.id,
          role: inserted!.role,
          character: inserted!.character,
          position: inserted!.position,
          personId,
          personName: input.name,
          personKind: input.kind,
        },
      },
      201,
    );
  },
);

const creditPatchSchema = creditInlineSchema
  .partial()
  .pick({ role: true, character: true })
  .extend({ position: z.number().int().min(0).optional() });

itemsRouter.patch(
  "/:id{[0-9]+}/credits/:creditId{[0-9]+}",
  zValidator("json", creditPatchSchema),
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const creditId = Number(c.req.param("creditId"));
    const input = c.req.valid("json");
    const db = getDb(c);

    // Ensure ownership via item.
    const [owned] = await db
      .select({ id: itemCredits.id })
      .from(itemCredits)
      .innerJoin(items, eq(items.id, itemCredits.itemId))
      .where(
        and(
          eq(itemCredits.id, creditId),
          eq(itemCredits.itemId, id),
          eq(items.userId, user.id),
        ),
      )
      .limit(1);
    if (!owned) return c.json({ error: "not_found" }, 404);

    await db.update(itemCredits).set(input).where(eq(itemCredits.id, creditId));
    return c.body(null, 204);
  },
);

itemsRouter.delete(
  "/:id{[0-9]+}/credits/:creditId{[0-9]+}",
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const creditId = Number(c.req.param("creditId"));
    const db = getDb(c);

    const [owned] = await db
      .select({ id: itemCredits.id })
      .from(itemCredits)
      .innerJoin(items, eq(items.id, itemCredits.itemId))
      .where(
        and(
          eq(itemCredits.id, creditId),
          eq(itemCredits.itemId, id),
          eq(items.userId, user.id),
        ),
      )
      .limit(1);
    if (!owned) return c.body(null, 204);

    await db.delete(itemCredits).where(eq(itemCredits.id, creditId));
    return c.body(null, 204);
  },
);

// ---- helpers ----

async function attachCredits(
  c: Parameters<typeof getDb>[0],
  userId: string,
  itemId: number,
  inputs: CreditInline[],
): Promise<void> {
  const db = getDb(c);
  const rows: Array<{
    itemId: number;
    personId: number;
    role: string;
    character: string | null;
    position: number;
  }> = [];

  for (let i = 0; i < inputs.length; i++) {
    const credit = inputs[i];
    if (!credit) continue;
    const personId = await upsertPerson(c, userId, credit);
    if (personId === null) continue;
    rows.push({
      itemId,
      personId,
      role: credit.role,
      character: credit.character ?? null,
      position: i,
    });
  }

  if (rows.length) {
    await db.insert(itemCredits).values(rows);
  }
}

async function upsertPerson(
  c: Parameters<typeof getDb>[0],
  userId: string,
  credit: CreditInline,
): Promise<number | null> {
  const db = getDb(c);

  if (credit.externalIds) {
    for (const [key, value] of Object.entries(credit.externalIds)) {
      const match = await findPersonByExternalId(c, userId, key, value);
      if (match) return match.id;
    }
  }

  const [byName] = await db
    .select()
    .from(people)
    .where(
      and(
        eq(people.userId, userId),
        eq(people.name, credit.name),
        eq(people.kind, credit.kind),
      ),
    )
    .limit(1);

  if (byName) {
    if (credit.externalIds) {
      const merged = { ...(byName.externalIds ?? {}), ...credit.externalIds };
      await db.update(people).set({ externalIds: merged }).where(eq(people.id, byName.id));
    }
    return byName.id;
  }

  const [inserted] = await db
    .insert(people)
    .values({
      userId,
      name: credit.name,
      kind: credit.kind,
      externalIds: credit.externalIds ?? null,
    })
    .returning();

  return inserted?.id ?? null;
}

async function findPersonByExternalId(
  c: Parameters<typeof getDb>[0],
  userId: string,
  key: string,
  value: string | number,
): Promise<Person | null> {
  const db = getDb(c);
  const [row] = await db
    .select()
    .from(people)
    .where(
      and(
        eq(people.userId, userId),
        sql`json_extract(${people.externalIds}, ${"$." + key}) = ${value}`,
      ),
    )
    .limit(1);
  return row ?? null;
}
