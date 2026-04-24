import {
  people,
  shelves,
  tags,
  workCredits,
  workTags,
  works,
  type Person,
} from "@reel/database";
import {
  creditInlineSchema,
  type CreditInline,
  workKindSchema,
  workWithShelfInputSchema,
} from "@reel/shared";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const worksRouter = new Hono<AppEnv>();

// Visibility predicate — a work is visible to the caller if it is global
// (owner_id IS NULL) or privately owned by them.
function visibleTo(userId: string) {
  return or(isNull(works.ownerId), eq(works.ownerId, userId));
}

// Flattened shape returned to clients: reference fields + the caller's shelf
// row folded in. Matches the pre-refactor response keys, with the addition of
// `synopsis` (reference) separate from `notes` (personal, from shelf).
type FlatWork = {
  id: number;
  ownerId: string | null;
  kind: (typeof works.$inferSelect)["kind"];
  title: string;
  year: number | null;
  releaseDate: string | null;
  synopsis: string | null;
  coverUrl: string | null;
  externalIds: Record<string, string | number> | null;
  createdAt: Date;
  updatedAt: Date;
  // From the caller's shelf row (null when they have no shelf entry):
  status: (typeof shelves.$inferSelect)["status"] | null;
  rating: number | null;
  notes: string | null;
  completedAt: number | null;
};

function flatten(
  w: typeof works.$inferSelect,
  s: typeof shelves.$inferSelect | null,
): FlatWork {
  return {
    id: w.id,
    ownerId: w.ownerId,
    kind: w.kind,
    title: w.title,
    year: w.year,
    releaseDate: w.releaseDate,
    synopsis: w.synopsis,
    coverUrl: w.coverUrl,
    externalIds: w.externalIds,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    status: s?.status ?? null,
    rating: s?.rating ?? null,
    notes: s?.notes ?? null,
    completedAt: s?.completedAt ?? null,
  };
}

worksRouter.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c);
  const kindParam = c.req.query("kind");
  const kind = kindParam ? workKindSchema.safeParse(kindParam) : null;
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20) || 20));

  const where = kind?.success
    ? and(visibleTo(user.id), eq(works.kind, kind.data))
    : visibleTo(user.id);

  const rows = await db
    .select({ w: works, s: shelves })
    .from(works)
    .leftJoin(
      shelves,
      and(
        eq(shelves.workId, works.id),
        eq(shelves.userId, user.id),
        isNull(shelves.seasonId),
      ),
    )
    .where(where)
    .orderBy(desc(works.createdAt))
    .limit(limit)
    .offset(offset);

  const nextOffset = rows.length === limit ? offset + limit : null;
  return c.json({ works: rows.map((r) => flatten(r.w, r.s)), nextOffset });
});

worksRouter.get("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);

  const [row] = await db
    .select({ w: works, s: shelves })
    .from(works)
    .leftJoin(
      shelves,
      and(
        eq(shelves.workId, works.id),
        eq(shelves.userId, user.id),
        isNull(shelves.seasonId),
      ),
    )
    .where(and(eq(works.id, id), visibleTo(user.id)))
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);

  // Credits: show anything on this work. People visible to caller follow the
  // same global/private rule, but a credit on a visible work always has a
  // visible person by construction (we enforce that on write).
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
    // Tags attached to this work *by this user*. Other users' tag rows on the
    // same work are irrelevant to me.
    db
      .select({ tagId: workTags.tagId })
      .from(workTags)
      .innerJoin(tags, eq(tags.id, workTags.tagId))
      .where(and(eq(workTags.workId, id), eq(tags.userId, user.id))),
  ]);

  return c.json({
    work: flatten(row.w, row.s),
    credits,
    tagIds: tagRows.map((r) => r.tagId),
  });
});

worksRouter.post("/", zValidator("json", workWithShelfInputSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const db = getDb(c);

  const {
    credits: inlineCredits = [],
    // shelf-only fields:
    status,
    rating,
    notes,
    completedAt,
    // reference fields pass through:
    ...refFields
  } = input;

  // A payload with externalIds asserts "this is a real known thing" — make it
  // global. Dedup against existing globals by any matching external id.
  const hasExternalIds =
    refFields.externalIds && Object.keys(refFields.externalIds).length > 0;

  let work: typeof works.$inferSelect | null = null;
  if (hasExternalIds) {
    work = await findGlobalByExternalIds(c, refFields.kind, refFields.externalIds!);
  }

  if (!work) {
    const [inserted] = await db
      .insert(works)
      .values({
        ...refFields,
        ownerId: hasExternalIds ? null : user.id,
      })
      .returning();
    if (!inserted) return c.json({ error: "insert_failed" }, 500);
    work = inserted;

    // Only attach user-supplied credits when WE created the work. If we reused
    // an existing global, its credits are curated and we don't merge in.
    if (inlineCredits.length) {
      await attachCredits(c, user.id, work, inlineCredits);
    }
  }

  // Upsert this user's shelf for the work. Every call creates/updates the
  // caller's shelf — that's what "add to my library" means.
  const shelfRow = await upsertWorkShelf(c, user.id, work.id, {
    status: status ?? "wishlist",
    rating: rating ?? null,
    notes: notes ?? null,
    completedAt: completedAt ?? null,
  });

  return c.json({ work: flatten(work, shelfRow) }, 201);
});

const patchBodySchema = workWithShelfInputSchema.partial().extend({
  tagIds: z.array(z.number().int()).optional(),
});

worksRouter.patch("/:id{[0-9]+}", zValidator("json", patchBodySchema), async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const input = c.req.valid("json");
  const db = getDb(c);

  const [existing] = await db
    .select()
    .from(works)
    .where(and(eq(works.id, id), visibleTo(user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);

  const {
    credits: _credits,
    tagIds,
    status,
    rating,
    notes,
    completedAt,
    ...refFields
  } = input;
  void _credits;

  // Reference edits are restricted: only the owner of a private work can
  // mutate its reference fields. Globals are frozen for normal users.
  const hasRefChange = Object.keys(refFields).length > 0;
  if (hasRefChange) {
    if (existing.ownerId !== user.id) {
      return c.json({ error: "forbidden", reason: "work_is_global" }, 403);
    }
    await db
      .update(works)
      .set({ ...refFields, updatedAt: new Date() })
      .where(eq(works.id, id));
  }

  // Shelf edits are always scoped to the caller's own shelf row. Allowed
  // regardless of work visibility.
  const hasShelfChange =
    status !== undefined ||
    rating !== undefined ||
    notes !== undefined ||
    completedAt !== undefined;
  if (hasShelfChange) {
    await upsertWorkShelf(c, user.id, id, {
      status,
      rating,
      notes,
      completedAt,
    });
  }

  if (tagIds) {
    if (tagIds.length) {
      const ownedTags = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(inArray(tags.id, tagIds), eq(tags.userId, user.id)));
      if (ownedTags.length !== tagIds.length) return c.json({ error: "tag_not_owned" }, 400);
    }
    // Only rewrite the caller's tag rows on this work. Other users' tag rows
    // (they own different tag ids) stay put.
    const myTagIds = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.userId, user.id));
    const myTagIdSet = new Set(myTagIds.map((t) => t.id));
    const existingLinks = await db
      .select({ tagId: workTags.tagId })
      .from(workTags)
      .where(eq(workTags.workId, id));
    const toDelete = existingLinks
      .map((l) => l.tagId)
      .filter((t) => myTagIdSet.has(t));
    if (toDelete.length) {
      await db
        .delete(workTags)
        .where(and(eq(workTags.workId, id), inArray(workTags.tagId, toDelete)));
    }
    if (tagIds.length) {
      await db.insert(workTags).values(tagIds.map((tagId) => ({ workId: id, tagId })));
    }
  }

  // Return the fresh flattened shape.
  const [refreshed] = await db
    .select({ w: works, s: shelves })
    .from(works)
    .leftJoin(
      shelves,
      and(
        eq(shelves.workId, works.id),
        eq(shelves.userId, user.id),
        isNull(shelves.seasonId),
      ),
    )
    .where(eq(works.id, id))
    .limit(1);
  if (!refreshed) return c.json({ error: "not_found" }, 404);
  return c.json({ work: flatten(refreshed.w, refreshed.s) });
});

// DELETE semantics differ by visibility:
//   - private + owned by me → delete the work entirely (cascades shelves,
//     credits, tags, article_works).
//   - otherwise (global, or someone else's private — shouldn't be visible
//     anyway) → "remove from my library": delete my shelf rows for it.
worksRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);

  const [existing] = await db
    .select({ ownerId: works.ownerId })
    .from(works)
    .where(and(eq(works.id, id), visibleTo(user.id)))
    .limit(1);
  if (!existing) return c.body(null, 204);

  if (existing.ownerId === user.id) {
    await db.delete(works).where(eq(works.id, id));
  } else {
    await db
      .delete(shelves)
      .where(and(eq(shelves.workId, id), eq(shelves.userId, user.id)));
  }
  return c.body(null, 204);
});

// ---- credits management on a work ----
// Credits are curated reference data and follow the same rule as other
// reference fields: only editable on a private work the caller owns.

async function assertPrivateOwned(
  c: Parameters<typeof getDb>[0],
  workId: number,
  userId: string,
): Promise<boolean> {
  const db = getDb(c);
  const [row] = await db
    .select({ id: works.id })
    .from(works)
    .where(and(eq(works.id, workId), eq(works.ownerId, userId)))
    .limit(1);
  return Boolean(row);
}

worksRouter.post(
  "/:id{[0-9]+}/credits",
  zValidator("json", creditInlineSchema),
  async (c) => {
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const input = c.req.valid("json");
    const db = getDb(c);

    if (!(await assertPrivateOwned(c, id, user.id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const personId = await upsertPerson(c, user.id, input, { global: false });
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

    if (!(await assertPrivateOwned(c, id, user.id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    const [owned] = await db
      .select({ id: workCredits.id })
      .from(workCredits)
      .where(and(eq(workCredits.id, creditId), eq(workCredits.workId, id)))
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

    if (!(await assertPrivateOwned(c, id, user.id))) {
      return c.json({ error: "forbidden" }, 403);
    }

    await db
      .delete(workCredits)
      .where(and(eq(workCredits.id, creditId), eq(workCredits.workId, id)));
    return c.body(null, 204);
  },
);

// ---- helpers ----

async function findGlobalByExternalIds(
  c: Parameters<typeof getDb>[0],
  kind: (typeof works.$inferSelect)["kind"],
  externalIds: Record<string, string | number>,
): Promise<typeof works.$inferSelect | null> {
  const db = getDb(c);
  for (const [key, value] of Object.entries(externalIds)) {
    const [row] = await db
      .select()
      .from(works)
      .where(
        and(
          isNull(works.ownerId),
          eq(works.kind, kind),
          sql`json_extract(${works.externalIds}, ${"$." + key}) = ${value}`,
        ),
      )
      .limit(1);
    if (row) return row;
  }
  return null;
}

async function upsertWorkShelf(
  c: Parameters<typeof getDb>[0],
  userId: string,
  workId: number,
  fields: {
    status?: (typeof shelves.$inferSelect)["status"];
    rating?: number | null;
    notes?: string | null;
    completedAt?: number | null;
  },
): Promise<typeof shelves.$inferSelect> {
  const db = getDb(c);
  const [existing] = await db
    .select()
    .from(shelves)
    .where(
      and(
        eq(shelves.userId, userId),
        eq(shelves.workId, workId),
        isNull(shelves.seasonId),
      ),
    )
    .limit(1);

  if (existing) {
    const patch: Partial<typeof shelves.$inferInsert> = { updatedAt: new Date() };
    if (fields.status !== undefined) patch.status = fields.status;
    if (fields.rating !== undefined) patch.rating = fields.rating;
    if (fields.notes !== undefined) patch.notes = fields.notes;
    if (fields.completedAt !== undefined) patch.completedAt = fields.completedAt;
    const [updated] = await db
      .update(shelves)
      .set(patch)
      .where(eq(shelves.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [inserted] = await db
    .insert(shelves)
    .values({
      userId,
      workId,
      seasonId: null,
      status: fields.status ?? "wishlist",
      rating: fields.rating ?? null,
      notes: fields.notes ?? null,
      completedAt: fields.completedAt ?? null,
    })
    .returning();
  if (!inserted) throw new Error("shelf_insert_failed");
  return inserted;
}

async function attachCredits(
  c: Parameters<typeof getDb>[0],
  userId: string,
  work: typeof works.$inferSelect,
  inputs: CreditInline[],
): Promise<void> {
  const db = getDb(c);
  const isGlobal = work.ownerId === null;
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
    const personId = await upsertPerson(c, userId, credit, { global: isGlobal });
    if (personId === null) continue;
    rows.push({
      workId: work.id,
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

// Dedup a person before creating. When creating credits on a global work, the
// attached people must also be global (enforced here by passing { global: true }).
// For a private work, prefer matching globals first (Keanu Reeves already
// exists globally — link to that), else fall back to / create a private under
// the caller's ownership.
async function upsertPerson(
  c: Parameters<typeof getDb>[0],
  userId: string,
  credit: CreditInline,
  opts: { global: boolean },
): Promise<number | null> {
  const db = getDb(c);

  if (credit.externalIds) {
    for (const [key, value] of Object.entries(credit.externalIds)) {
      // Prefer a global match first.
      const globalMatch = await findPersonByExternalId(c, null, key, value);
      if (globalMatch) return globalMatch.id;
      if (!opts.global) {
        const ownMatch = await findPersonByExternalId(c, userId, key, value);
        if (ownMatch) return ownMatch.id;
      }
    }
  }

  // Name + kind match. Same prefer-global rule.
  const globalByName = await findPersonByNameKind(c, null, credit);
  if (globalByName) {
    if (credit.externalIds) {
      const merged = { ...(globalByName.externalIds ?? {}), ...credit.externalIds };
      await db.update(people).set({ externalIds: merged }).where(eq(people.id, globalByName.id));
    }
    return globalByName.id;
  }
  if (!opts.global) {
    const ownByName = await findPersonByNameKind(c, userId, credit);
    if (ownByName) {
      if (credit.externalIds) {
        const merged = { ...(ownByName.externalIds ?? {}), ...credit.externalIds };
        await db.update(people).set({ externalIds: merged }).where(eq(people.id, ownByName.id));
      }
      return ownByName.id;
    }
  }

  const [inserted] = await db
    .insert(people)
    .values({
      ownerId: opts.global ? null : userId,
      name: credit.name,
      kind: credit.kind,
      externalIds: credit.externalIds ?? null,
    })
    .returning();

  return inserted?.id ?? null;
}

async function findPersonByExternalId(
  c: Parameters<typeof getDb>[0],
  ownerId: string | null,
  key: string,
  value: string | number,
): Promise<Person | null> {
  const db = getDb(c);
  const ownerCondition = ownerId === null ? isNull(people.ownerId) : eq(people.ownerId, ownerId);
  const [row] = await db
    .select()
    .from(people)
    .where(
      and(
        ownerCondition,
        sql`json_extract(${people.externalIds}, ${"$." + key}) = ${value}`,
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findPersonByNameKind(
  c: Parameters<typeof getDb>[0],
  ownerId: string | null,
  credit: CreditInline,
): Promise<Person | null> {
  const db = getDb(c);
  const ownerCondition = ownerId === null ? isNull(people.ownerId) : eq(people.ownerId, ownerId);
  const [row] = await db
    .select()
    .from(people)
    .where(and(ownerCondition, eq(people.name, credit.name), eq(people.kind, credit.kind)))
    .limit(1);
  return row ?? null;
}
