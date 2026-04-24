import { people, workCredits, works } from "@reel/database";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const peopleRouter = new Hono<AppEnv>();

// Same global/private visibility rule as works: null owner = global, set owner
// = only visible to that user.
function personVisibleTo(userId: string) {
  return or(isNull(people.ownerId), eq(people.ownerId, userId));
}
function workVisibleTo(userId: string) {
  return or(isNull(works.ownerId), eq(works.ownerId, userId));
}

peopleRouter.get("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20) || 20));

  const [person] = await db
    .select({
      id: people.id,
      name: people.name,
      kind: people.kind,
      externalIds: people.externalIds,
      ownerId: people.ownerId,
    })
    .from(people)
    .where(and(eq(people.id, id), personVisibleTo(user.id)))
    .limit(1);
  if (!person) return c.json({ error: "not_found" }, 404);

  const credits = await db
    .select({
      creditId: workCredits.id,
      workId: works.id,
      kind: works.kind,
      title: works.title,
      year: works.year,
      coverUrl: works.coverUrl,
      role: workCredits.role,
      character: workCredits.character,
      position: workCredits.position,
    })
    .from(workCredits)
    .innerJoin(works, eq(works.id, workCredits.workId))
    .where(and(eq(workCredits.personId, id), workVisibleTo(user.id)))
    .orderBy(asc(works.kind), asc(works.title))
    .limit(limit)
    .offset(offset);

  const nextOffset = credits.length === limit ? offset + limit : null;
  return c.json({ person, credits, nextOffset });
});
