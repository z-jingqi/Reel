import { seasons, shelves, works } from "@reel/database";
import { seasonInputSchema, shelfInputSchema, workStatusSchema } from "@reel/shared";
import { and, eq, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const seasonsRouter = new Hono<AppEnv>();

// Seasons belong to works, which may be global or private. Any user who can
// see the parent work can see its seasons (shared structural data). Per-user
// season state (status, rating, notes, completedAt) lives on shelves keyed by
// (user, work, season).
function workVisibleTo(userId: string) {
  return or(isNull(works.ownerId), eq(works.ownerId, userId));
}

async function canReadWork(
  c: Parameters<typeof getDb>[0],
  workId: number,
  userId: string,
): Promise<boolean> {
  const db = getDb(c);
  const [row] = await db
    .select({ id: works.id })
    .from(works)
    .where(and(eq(works.id, workId), workVisibleTo(userId)))
    .limit(1);
  return Boolean(row);
}

async function ownsPrivateWork(
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

async function ownsWorkContainingSeason(
  c: Parameters<typeof getDb>[0],
  seasonId: number,
  userId: string,
): Promise<boolean> {
  const db = getDb(c);
  const [row] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .innerJoin(works, eq(works.id, seasons.workId))
    .where(and(eq(seasons.id, seasonId), eq(works.ownerId, userId)))
    .limit(1);
  return Boolean(row);
}

type SeasonRow = typeof seasons.$inferSelect;
type ShelfRow = typeof shelves.$inferSelect;

// Flatten season + caller's shelf row into the shape the existing frontend
// expects (status/rating/notes/completedAt directly on the season).
function flatten(s: SeasonRow, shelf: ShelfRow | null) {
  return {
    id: s.id,
    workId: s.workId,
    number: s.number,
    title: s.title,
    year: s.year,
    status: shelf?.status ?? "wishlist",
    rating: shelf?.rating ?? null,
    notes: shelf?.notes ?? null,
    completedAt: shelf?.completedAt ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

seasonsRouter.get("/", async (c) => {
  const user = c.get("user");
  const workId = Number(c.req.query("workId"));
  if (!workId) return c.json({ error: "workId required" }, 400);
  if (!(await canReadWork(c, workId, user.id))) return c.json({ error: "not_found" }, 404);

  const db = getDb(c);
  const rows = await db
    .select({ s: seasons, shelf: shelves })
    .from(seasons)
    .leftJoin(
      shelves,
      and(
        eq(shelves.seasonId, seasons.id),
        eq(shelves.userId, user.id),
      ),
    )
    .where(eq(seasons.workId, workId))
    .orderBy(seasons.number);

  return c.json({ seasons: rows.map((r) => flatten(r.s, r.shelf)) });
});

// Creating a season is a reference-data write — allowed only on a private
// work the caller owns. For globals, season list is frozen and only admin /
// refresh-from-provider can add more.
const seasonWithShelfSchema = seasonInputSchema.merge(shelfInputSchema.partial());

seasonsRouter.post("/", zValidator("json", seasonWithShelfSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  if (!(await ownsPrivateWork(c, input.workId, user.id))) {
    return c.json({ error: "forbidden" }, 403);
  }
  const db = getDb(c);

  const { status, rating, notes, completedAt, ...refFields } = input;
  const [season] = await db.insert(seasons).values(refFields).returning();
  if (!season) return c.json({ error: "insert_failed" }, 500);

  const shelf = await upsertSeasonShelf(c, user.id, season.workId, season.id, {
    status: status ?? "wishlist",
    rating: rating ?? null,
    notes: notes ?? null,
    completedAt: completedAt ?? null,
  });

  return c.json({ season: flatten(season, shelf) }, 201);
});

const seasonPatchSchema = seasonInputSchema
  .partial()
  .merge(shelfInputSchema.partial());

seasonsRouter.patch("/:id{[0-9]+}", zValidator("json", seasonPatchSchema), async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const input = c.req.valid("json");
  const db = getDb(c);

  const [existing] = await db
    .select({ s: seasons, ownerId: works.ownerId })
    .from(seasons)
    .innerJoin(works, eq(works.id, seasons.workId))
    .where(and(eq(seasons.id, id), workVisibleTo(user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);

  const { status, rating, notes, completedAt, ...refFields } = input;

  const hasRefChange = Object.keys(refFields).length > 0;
  if (hasRefChange) {
    if (existing.ownerId !== user.id) {
      return c.json({ error: "forbidden", reason: "season_is_global" }, 403);
    }
    await db
      .update(seasons)
      .set({ ...refFields, updatedAt: new Date() })
      .where(eq(seasons.id, id));
  }

  const hasShelfChange =
    status !== undefined ||
    rating !== undefined ||
    notes !== undefined ||
    completedAt !== undefined;
  if (hasShelfChange) {
    await upsertSeasonShelf(c, user.id, existing.s.workId, id, {
      status,
      rating,
      notes,
      completedAt,
    });
  }

  const [refreshed] = await db
    .select({ s: seasons, shelf: shelves })
    .from(seasons)
    .leftJoin(
      shelves,
      and(eq(shelves.seasonId, seasons.id), eq(shelves.userId, user.id)),
    )
    .where(eq(seasons.id, id))
    .limit(1);
  if (!refreshed) return c.json({ error: "not_found" }, 404);
  return c.json({ season: flatten(refreshed.s, refreshed.shelf) });
});

seasonsRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);

  // Private owner deletes the season outright. Anyone else (a global season)
  // can only "remove from my library" — drop their shelf row.
  if (await ownsWorkContainingSeason(c, id, user.id)) {
    await db.delete(seasons).where(eq(seasons.id, id));
  } else {
    await db
      .delete(shelves)
      .where(and(eq(shelves.seasonId, id), eq(shelves.userId, user.id)));
  }
  return c.body(null, 204);
});

async function upsertSeasonShelf(
  c: Parameters<typeof getDb>[0],
  userId: string,
  workId: number,
  seasonId: number,
  fields: {
    status?: z.infer<typeof workStatusSchema>;
    rating?: number | null;
    notes?: string | null;
    completedAt?: number | null;
  },
): Promise<ShelfRow> {
  const db = getDb(c);
  const [existing] = await db
    .select()
    .from(shelves)
    .where(
      and(
        eq(shelves.userId, userId),
        eq(shelves.seasonId, seasonId),
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
      seasonId,
      status: fields.status ?? "wishlist",
      rating: fields.rating ?? null,
      notes: fields.notes ?? null,
      completedAt: fields.completedAt ?? null,
    })
    .returning();
  if (!inserted) throw new Error("shelf_insert_failed");
  return inserted;
}
