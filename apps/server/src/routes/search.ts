import { articles, items } from "@reel/database";
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
  if (!q) return c.json({ items: [], articles: [] });

  const ftsQuery = toFtsQuery(q);
  if (!ftsQuery) return c.json({ items: [], articles: [] });

  const db = getDb(c);

  const [itemHits, articleHits] = await Promise.all([
    scope === "articles"
      ? Promise.resolve([])
      : db
          .select({
            id: items.id,
            kind: items.kind,
            title: items.title,
            year: items.year,
            rating: items.rating,
            status: items.status,
            coverUrl: items.coverUrl,
          })
          .from(items)
          .where(
            and(
              eq(items.userId, user.id),
              sql`${items.id} IN (SELECT rowid FROM items_fts WHERE items_fts MATCH ${ftsQuery})`,
            ),
          )
          .limit(20),
    scope === "items"
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

  return c.json({ items: itemHits, articles: articleHits });
});
