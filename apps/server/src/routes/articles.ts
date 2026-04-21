import {
  articleCategories,
  articleTags,
  articleWorks,
  articles,
  categories,
  tags,
  works,
} from "@reel/database";
import { articleInputSchema, slugify } from "@reel/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const articlesRouter = new Hono<AppEnv>();

articlesRouter.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c);
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 20) || 20));
  const rows = await db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      pinned: articles.pinned,
      createdAt: articles.createdAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .where(eq(articles.userId, user.id))
    .orderBy(desc(articles.pinned), desc(articles.updatedAt))
    .limit(limit)
    .offset(offset);
  const nextOffset = rows.length === limit ? offset + limit : null;
  return c.json({ articles: rows, nextOffset });
});

articlesRouter.get("/:slug", async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  const db = getDb(c);
  const [row] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.slug, slug), eq(articles.userId, user.id)))
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);

  const [linkedWorks, linkedCategories, linkedTags] = await Promise.all([
    db.select().from(articleWorks).where(eq(articleWorks.articleId, row.id)),
    db.select().from(articleCategories).where(eq(articleCategories.articleId, row.id)),
    db.select().from(articleTags).where(eq(articleTags.articleId, row.id)),
  ]);

  return c.json({
    article: row,
    workIds: linkedWorks.map((r) => r.workId),
    categoryIds: linkedCategories.map((r) => r.categoryId),
    tagIds: linkedTags.map((r) => r.tagId),
  });
});

async function verifyOwnedIds(
  c: Parameters<typeof getDb>[0],
  userId: string,
  workIds: number[],
  categoryIds: number[],
  tagIds: number[],
): Promise<string | null> {
  const db = getDb(c);
  if (workIds.length) {
    const owned = await db
      .select({ id: works.id })
      .from(works)
      .where(and(inArray(works.id, workIds), eq(works.userId, userId)));
    if (owned.length !== workIds.length) return "work_not_owned";
  }
  if (categoryIds.length) {
    const owned = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, categoryIds), eq(categories.userId, userId)));
    if (owned.length !== categoryIds.length) return "category_not_owned";
  }
  if (tagIds.length) {
    const owned = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, tagIds), eq(tags.userId, userId)));
    if (owned.length !== tagIds.length) return "tag_not_owned";
  }
  return null;
}

articlesRouter.post("/", zValidator("json", articleInputSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const err = await verifyOwnedIds(c, user.id, input.workIds, input.categoryIds, input.tagIds);
  if (err) return c.json({ error: err }, 400);

  const db = getDb(c);
  const slug = input.slug?.trim() || slugify(input.title) || `draft-${Date.now()}`;

  const [row] = await db
    .insert(articles)
    .values({
      userId: user.id,
      slug,
      title: input.title,
      bodyJson: input.bodyJson,
      bodyText: input.bodyText,
      pinned: input.pinned,
    })
    .returning();

  if (!row) return c.json({ error: "insert_failed" }, 500);

  if (input.workIds.length) {
    await db.insert(articleWorks).values(
      input.workIds.map((workId, i) => ({ articleId: row.id, workId, position: i })),
    );
  }
  if (input.categoryIds.length) {
    await db.insert(articleCategories).values(
      input.categoryIds.map((categoryId) => ({ articleId: row.id, categoryId })),
    );
  }
  if (input.tagIds.length) {
    await db.insert(articleTags).values(
      input.tagIds.map((tagId) => ({ articleId: row.id, tagId })),
    );
  }

  return c.json({ article: row }, 201);
});

articlesRouter.patch("/:id{[0-9]+}", zValidator("json", articleInputSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const input = c.req.valid("json");
  const db = getDb(c);

  const [existing] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.id, id), eq(articles.userId, user.id)))
    .limit(1);
  if (!existing) return c.json({ error: "not_found" }, 404);

  const err = await verifyOwnedIds(
    c,
    user.id,
    input.workIds ?? [],
    input.categoryIds ?? [],
    input.tagIds ?? [],
  );
  if (err) return c.json({ error: err }, 400);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.title !== undefined) updates.title = input.title;
  if (input.bodyJson !== undefined) updates.bodyJson = input.bodyJson;
  if (input.bodyText !== undefined) updates.bodyText = input.bodyText;
  if (input.pinned !== undefined) updates.pinned = input.pinned;

  const [row] = await db.update(articles).set(updates).where(eq(articles.id, id)).returning();

  if (input.workIds) {
    await db.delete(articleWorks).where(eq(articleWorks.articleId, id));
    if (input.workIds.length) {
      await db.insert(articleWorks).values(
        input.workIds.map((workId, i) => ({ articleId: id, workId, position: i })),
      );
    }
  }
  if (input.categoryIds) {
    await db.delete(articleCategories).where(eq(articleCategories.articleId, id));
    if (input.categoryIds.length) {
      await db.insert(articleCategories).values(
        input.categoryIds.map((categoryId) => ({ articleId: id, categoryId })),
      );
    }
  }
  if (input.tagIds) {
    await db.delete(articleTags).where(eq(articleTags.articleId, id));
    if (input.tagIds.length) {
      await db.insert(articleTags).values(
        input.tagIds.map((tagId) => ({ articleId: id, tagId })),
      );
    }
  }

  return c.json({ article: row });
});

articlesRouter.delete("/:id{[0-9]+}", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const db = getDb(c);
  await db.delete(articles).where(and(eq(articles.id, id), eq(articles.userId, user.id)));
  return c.body(null, 204);
});
