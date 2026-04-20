import { articles, memories, settings } from "@reel/database";
import {
  credentialsFromEnv,
  getModelInstance,
  resolveModel,
  type ModelSelection,
} from "@reel/ai-core";
import {
  memoryAnalyzeSchema,
  memoryKindSchema,
  memoryUpsertSchema,
  modelSelectionSchema,
} from "@reel/shared";
import { generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const memoriesRouter = new Hono<AppEnv>();

memoriesRouter.get("/", async (c) => {
  const user = c.get("user");
  const db = getDb(c);
  const rows = await db.select().from(memories).where(eq(memories.userId, user.id));
  return c.json({ memories: rows });
});

memoriesRouter.get("/:kind", async (c) => {
  const user = c.get("user");
  const kind = memoryKindSchema.safeParse(c.req.param("kind"));
  if (!kind.success) return c.json({ error: "invalid_kind" }, 400);
  const db = getDb(c);
  const [row] = await db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, user.id), eq(memories.kind, kind.data)))
    .limit(1);
  return c.json({ memory: row ?? null });
});

memoriesRouter.put(
  "/:kind",
  zValidator("json", memoryUpsertSchema),
  async (c) => {
    const user = c.get("user");
    const kind = memoryKindSchema.safeParse(c.req.param("kind"));
    if (!kind.success) return c.json({ error: "invalid_kind" }, 400);
    const { content } = c.req.valid("json");
    const db = getDb(c);

    const [existing] = await db
      .select({ id: memories.id })
      .from(memories)
      .where(and(eq(memories.userId, user.id), eq(memories.kind, kind.data)))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(memories)
        .set({ content, updatedAt: new Date() })
        .where(eq(memories.id, existing.id))
        .returning();
      return c.json({ memory: row });
    }

    const [row] = await db
      .insert(memories)
      .values({ userId: user.id, kind: kind.data, content })
      .returning();
    return c.json({ memory: row }, 201);
  },
);

memoriesRouter.delete("/:kind", async (c) => {
  const user = c.get("user");
  const kind = memoryKindSchema.safeParse(c.req.param("kind"));
  if (!kind.success) return c.json({ error: "invalid_kind" }, 400);
  const db = getDb(c);
  await db
    .delete(memories)
    .where(and(eq(memories.userId, user.id), eq(memories.kind, kind.data)));
  return c.body(null, 204);
});

memoriesRouter.post("/analyze", zValidator("json", memoryAnalyzeSchema), async (c) => {
  const user = c.get("user");
  const { sampleCount = 6 } = c.req.valid("json");
  const db = getDb(c);

  const samples = await db
    .select({ title: articles.title, bodyText: articles.bodyText })
    .from(articles)
    .where(eq(articles.userId, user.id))
    .orderBy(desc(articles.updatedAt))
    .limit(sampleCount);

  const nonEmpty = samples.filter((s) => s.bodyText.trim().length > 40);
  if (nonEmpty.length === 0) {
    return c.json({ error: "not_enough_content" }, 400);
  }

  const override = await loadModelOverride(c, user.id);
  const selection = resolveModel("writing", c.env, override);
  const model = getModelInstance(selection, credentialsFromEnv(c.env));

  const corpus = nonEmpty
    .map((s, i) => `### Sample ${i + 1}: ${s.title}\n${s.bodyText.slice(0, 4000)}`)
    .join("\n\n");

  const { text } = await generateText({
    model,
    system:
      "You are a careful editor. Read the author's writing and describe their voice, tone, " +
      "rhythm, sentence-length patterns, favored vocabulary, punctuation habits, and recurring " +
      "structural moves. Output a concise profile (150-300 words) written as direct guidance to " +
      "a writing assistant: 'Use short declarative sentences. Avoid adverbs. Favor em-dashes over " +
      "commas for asides.' No preamble, no bullet lists unless they are genuinely the clearest form.",
    prompt: `Author samples:\n\n${corpus}\n\nWrite the style profile now.`,
  });

  const [existing] = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(eq(memories.userId, user.id), eq(memories.kind, "style_writing")))
    .limit(1);

  if (existing) {
    await db
      .update(memories)
      .set({ content: text, updatedAt: new Date() })
      .where(eq(memories.id, existing.id));
  } else {
    await db
      .insert(memories)
      .values({ userId: user.id, kind: "style_writing", content: text });
  }

  return c.json({ content: text, sampleCount: nonEmpty.length });
});

async function loadModelOverride(
  c: Parameters<typeof getDb>[0],
  userId: string,
): Promise<ModelSelection | null> {
  const db = getDb(c);
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, "model:writing")))
    .limit(1);
  if (!row) return null;
  const parsed = modelSelectionSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}
