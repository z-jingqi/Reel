import { itemCredits, items, people } from "@reel/database";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const peopleRouter = new Hono<AppEnv>();

peopleRouter.get("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);

  const [person] = await db
    .select({
      id: people.id,
      name: people.name,
      kind: people.kind,
      externalIds: people.externalIds,
    })
    .from(people)
    .where(and(eq(people.id, id), eq(people.userId, user.id)))
    .limit(1);
  if (!person) return c.json({ error: "not_found" }, 404);

  const credits = await db
    .select({
      creditId: itemCredits.id,
      itemId: items.id,
      kind: items.kind,
      title: items.title,
      year: items.year,
      coverUrl: items.coverUrl,
      role: itemCredits.role,
      character: itemCredits.character,
      position: itemCredits.position,
    })
    .from(itemCredits)
    .innerJoin(items, eq(items.id, itemCredits.itemId))
    .where(and(eq(itemCredits.personId, id), eq(items.userId, user.id)))
    .orderBy(asc(items.kind), asc(items.title));

  return c.json({ person, credits });
});
