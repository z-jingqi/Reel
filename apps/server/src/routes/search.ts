import { articles, works } from "@reel/database";
import { and, eq, sql } from "drizzle-orm";
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

  const [workHits, articleHits] = await Promise.all([
    scope === "articles"
      ? Promise.resolve([])
      : db
          .select({
            id: works.id,
            kind: works.kind,
            title: works.title,
            year: works.year,
            rating: works.rating,
            status: works.status,
            coverUrl: works.coverUrl,
          })
          .from(works)
          .where(
            and(
              eq(works.userId, user.id),
              sql`${works.id} IN (SELECT rowid FROM works_fts WHERE works_fts MATCH ${ftsQuery})`,
            ),
          )
          .limit(20),
    scope === "works"
      ? Promise.resolve([])
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
          .limit(20),
  ]);

  return c.json({ works: workHits, articles: articleHits });
});
