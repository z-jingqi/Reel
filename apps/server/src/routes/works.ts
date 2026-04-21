import {
  people,
  tags,
  workCredits,
  workTags,
  works,
  type Person,
} from "@reel/database";
import {
  creditInlineSchema,
  type CreditInline,
  workInputSchema,
  workKindSchema,
} from "@reel/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const worksRouter = new Hono<AppEnv>();

worksRouter.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c);
  const kindParam = c.req.query("kind");
  const kind = kindParam ? workKindSchema.safeParse(kindParam) : null;
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20) || 20));
  const where = kind?.success
    ? and(eq(works.userId, user.id), eq(works.kind, kind.data))
    : eq(works.userId, user.id);
  const rows = await db
    .select()
    .from(works)
    .where(where)
    .orderBy(desc(works.createdAt))
    .limit(limit)
    .offset(offset);
  const nextOffset = rows.length === limit ? offset + limit : null;
  return c.json({ works: rows, nextOffset });
});

worksRouter.get("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  const [row] = await db
    .select()
    .from(works)
    .where(and(eq(works.id, id), eq(works.userId, user.id)))
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);

  const [credits, tagRows] = await Promise.all([
    db
      .select({
        id: workCredits.id,
        role: workCredits.role,
        character: workCredits.character,
        position: workCredits.position,
        personId: people.id,
        personName: people.name,
        personKind: people.kind,
      })
      .from(workCredits)
      .innerJoin(people, eq(people.id, workCredits.personId))
      .where(eq(workCredits.workId, id))
      .orderBy(workCredits.position),
    db.select({ tagId: workTags.tagId }).from(workTags).where(eq(workTags.workId, id)),
  ]);

  return c.json({
    work: row,
    credits,
    tagIds: tagRows.map((r) => r.tagId),
  });
});

worksRouter.post("/", zValidator("json", workInputSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const db = getDb(c);

  const { credits: inlineCredits = [], ...fields } = input;

  const [row] = await db
    .insert(works)
    .values({ ...fields, userId: user.id })
    .returning();
  if (!row) return c.json({ error: "insert_failed" }, 500);

  if (inlineCredits.length) {
    await attachCredits(c, user.id, row.id, inlineCredits);
  }

  return c.json({ work: row }, 201);
});

const patchBodySchema = workInputSchema
  .partial()
  .extend({
    tagIds: z.array(z.number().int()).optional(),
  });

worksRouter.patch("/:id{[0-9]+}", zValidator("json", patchBodySchema), async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const input = c.req.valid("json");
  const db = getDb(c);

  const { credits: _credits, tagIds, ...fields } = input;
  void _credits;

  const [owned] = await db
    .select({ id: works.id })
    .from(works)
    .where(and(eq(works.id, id), eq(works.userId, user.id)))
    .limit(1);
  if (!owned) return c.json({ error: "not_found" }, 404);

  let row = null as typeof works.$inferSelect | null;
  if (Object.keys(fields).length) {
    const [updated] = await db
      .update(works)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(works.id, id), eq(works.userId, user.id)))
      .returning();
    row = updated ?? null;
  } else {
    const [existing] = await db.select().from(works).where(eq(works.id, id)).limit(1);
    row = existing ?? null;
  }

  if (tagIds) {
    if (tagIds.length) {
      const ownedTags = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(inArray(tags.id, tagIds), eq(tags.userId, user.id)));
      if (ownedTags.length !== tagIds.length) return c.json({ error: "tag_not_owned" }, 400);
    }
    await db.delete(workTags).where(eq(workTags.workId, id));
    if (tagIds.length) {
      await db.insert(workTags).values(tagIds.map((tagId) => ({ workId: id, tagId })));
    }
  }

  return c.json({ work: row });
});

worksRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  await db.delete(works).where(and(eq(works.id, id), eq(works.userId, user.id)));
  return c.body(null, 204);
});

// ---- credits management on a work ----

worksRouter.post(
  "/:id{[0-9]+}/credits",
  zValidator("json", creditInlineSchema),
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const input = c.req.valid("json");
    const db = getDb(c);

    const [owned] = await db
      .select({ id: works.id })
      .from(works)
      .where(and(eq(works.id, id), eq(works.userId, user.id)))
      .limit(1);
    if (!owned) return c.json({ error: "not_found" }, 404);

    const personId = await upsertPerson(c, user.id, input);
    if (personId == null) return c.json({ error: "upsert_failed" }, 500);

    const [existingMax] = await db
      .select({ maxPos: sql<number>`COALESCE(MAX(${workCredits.position}), -1)`.as("maxPos") })
      .from(workCredits)
      .where(eq(workCredits.workId, id));
    const position = Number(existingMax?.maxPos ?? -1) + 1;

    const [inserted] = await db
      .insert(workCredits)
      .values({
        workId: id,
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

worksRouter.patch(
  "/:id{[0-9]+}/credits/:creditId{[0-9]+}",
  zValidator("json", creditPatchSchema),
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const creditId = Number(c.req.param("creditId"));
    const input = c.req.valid("json");
    const db = getDb(c);

    const [owned] = await db
      .select({ id: workCredits.id })
      .from(workCredits)
      .innerJoin(works, eq(works.id, workCredits.workId))
      .where(
        and(
          eq(workCredits.id, creditId),
          eq(workCredits.workId, id),
          eq(works.userId, user.id),
        ),
      )
      .limit(1);
    if (!owned) return c.json({ error: "not_found" }, 404);

    await db.update(workCredits).set(input).where(eq(workCredits.id, creditId));
    return c.body(null, 204);
  },
);

worksRouter.delete(
  "/:id{[0-9]+}/credits/:creditId{[0-9]+}",
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const creditId = Number(c.req.param("creditId"));
    const db = getDb(c);

    const [owned] = await db
      .select({ id: workCredits.id })
      .from(workCredits)
      .innerJoin(works, eq(works.id, workCredits.workId))
      .where(
        and(
          eq(workCredits.id, creditId),
          eq(workCredits.workId, id),
          eq(works.userId, user.id),
        ),
      )
      .limit(1);
    if (!owned) return c.body(null, 204);

    await db.delete(workCredits).where(eq(workCredits.id, creditId));
    return c.body(null, 204);
  },
);

// ---- helpers ----

async function attachCredits(
  c: Parameters<typeof getDb>[0],
  userId: string,
  workId: number,
  inputs: CreditInline[],
): Promise<void> {
  const db = getDb(c);
  const rows: Array<{
    workId: number;
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
      workId,
      personId,
      role: credit.role,
      character: credit.character ?? null,
      position: i,
    });
  }

  if (rows.length) {
    await db.insert(workCredits).values(rows);
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
