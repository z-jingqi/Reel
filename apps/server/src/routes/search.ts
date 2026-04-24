import { articles, shelves, works } from "@reel/database";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const searchRouter = new Hono<AppEnv>();

// Turn a user query into a safe FTS5 expression of prefix-matched tokens.
function toFtsQuery(input: string): string {
  const terms = input
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["()]/g, ""))
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"*`);
  return terms.join(" ");
}

searchRouter.get("/", async (c) => {
  const user = c.get("user");
  const q = (c.req.query("q") ?? "").trim();
  const scope = c.req.query("scope") ?? "all";
  if (!q) return c.json({ works: [], articles: [] });

  const ftsQuery = toFtsQuery(q);
  if (!ftsQuery) return c.json({ works: [], articles: [] });

  const db = getDb(c);

  // Works search: globals + caller's privates, with shelf fields folded in.
  const worksPromise =
    scope === "articles"
      ? Promise.resolve([] as Array<{
          id: number;
          kind: (typeof works.$inferSelect)["kind"];
          title: string;
          year: number | null;
          rating: number | null;
          status: (typeof shelves.$inferSelect)["status"] | null;
          coverUrl: string | null;
        }>)
      : db
          .select({
            id: works.id,
            kind: works.kind,
            title: works.title,
            year: works.year,
            rating: shelves.rating,
            status: shelves.status,
            coverUrl: works.coverUrl,
          })
          .from(works)
          .leftJoin(
            shelves,
            and(
              eq(shelves.workId, works.id),
              eq(shelves.userId, user.id),
              isNull(shelves.seasonId),
            ),
          )
          .where(
            and(
              or(isNull(works.ownerId), eq(works.ownerId, user.id)),
              sql`${works.id} IN (SELECT rowid FROM works_fts WHERE works_fts MATCH ${ftsQuery})`,
            ),
          )
          .limit(20);

  const articlesPromise =
    scope === "works"
      ? Promise.resolve([] as Array<{
          id: number;
          slug: string;
          title: string;
          updatedAt: Date;
        }>)
      : db
          .select({
            id: articles.id,
            slug: articles.slug,
            title: articles.title,
            updatedAt: articles.updatedAt,
          })
          .from(articles)
          .where(
            and(
              eq(articles.userId, user.id),
              sql`${articles.id} IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ${ftsQuery})`,
            ),
          )
          .limit(20);

  const [workHits, articleHits] = await Promise.all([worksPromise, articlesPromise]);

  return c.json({ works: workHits, articles: articleHits });
});
