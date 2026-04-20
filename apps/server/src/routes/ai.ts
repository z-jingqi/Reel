import { items, memories, settings } from "@reel/database";
import {
  credentialsFromEnv,
  getModelInstance,
  resolveModel,
  type ModelSelection,
} from "@reel/ai-core";
import { modelSelectionSchema, writingRequestSchema } from "@reel/shared";
import { streamText } from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

import { getDb } from "../db";
import type { AppEnv } from "../env";

export const aiRouter = new Hono<AppEnv>();

type ModelKey = "model:writing" | "model:chat" | "model:default";
type MemoryKind = "style_writing" | "style_about";

async function loadModelOverride(
  c: Parameters<typeof getDb>[0],
  userId: string,
  key: ModelKey,
): Promise<ModelSelection | null> {
  const db = getDb(c);
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, key)))
    .limit(1);
  if (!row) return null;
  const parsed = modelSelectionSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

async function loadMemory(
  c: Parameters<typeof getDb>[0],
  userId: string,
  kind: MemoryKind,
): Promise<string | null> {
  const db = getDb(c);
  const [row] = await db
    .select({ content: memories.content })
    .from(memories)
    .where(and(eq(memories.userId, userId), eq(memories.kind, kind)))
    .limit(1);
  return row?.content?.trim() || null;
}

function buildSystem(base: string, styleWriting: string | null): string {
  if (!styleWriting) return base;
  return (
    base +
    "\n\n--- User's writing style ---\n" +
    styleWriting +
    "\n--- End style ---\n" +
    "Match this voice, tone, rhythm, and lexical choices."
  );
}

aiRouter.post("/writing", zValidator("json", writingRequestSchema), async (c) => {
  const user = c.get("user");
  const req = c.req.valid("json");
  const [override, style] = await Promise.all([
    loadModelOverride(c, user.id, "model:writing"),
    loadMemory(c, user.id, "style_writing"),
  ]);
  const selection = resolveModel("writing", c.env, override);
  const model = getModelInstance(selection, credentialsFromEnv(c.env));

  const db = getDb(c);
  let linkedItemsBlock = "";
  if (req.itemIds.length) {
    const rows = await db
      .select()
      .from(items)
      .where(and(inArray(items.id, req.itemIds), eq(items.userId, user.id)));
    if (rows.length) {
      linkedItemsBlock =
        "\n\nLinked items:\n" +
        rows
          .map((r) => `- [${r.kind}] ${r.title}${r.year ? ` (${r.year})` : ""}`)
          .join("\n");
    }
  }

  const system = buildSystem(baseWritingSystem(req.action), style);
  const prompt = buildUserPrompt(req, linkedItemsBlock);

  const result = streamText({ model, system, prompt });
  return result.toTextStreamResponse();
});

aiRouter.post(
  "/chat",
  zValidator(
    "json",
    z.object({
      document: z.string().optional().default(""),
      itemIds: z.array(z.number().int()).default([]),
      instruction: z.string().optional().default(""),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const { document, itemIds, instruction } = c.req.valid("json");

    const [override, style] = await Promise.all([
      loadModelOverride(c, user.id, "model:chat"),
      loadMemory(c, user.id, "style_writing"),
    ]);
    const selection = resolveModel("chat", c.env, override);
    const model = getModelInstance(selection, credentialsFromEnv(c.env));

    const db = getDb(c);
    let linkedItemsBlock = "";
    if (itemIds.length) {
      const rows = await db
        .select()
        .from(items)
        .where(and(inArray(items.id, itemIds), eq(items.userId, user.id)));
      linkedItemsBlock = rows
        .map((r) => `- [${r.kind}] ${r.title}${r.year ? ` (${r.year})` : ""}`)
        .join("\n");
    }

    const baseSystem =
      "You are a helpful assistant discussing the user's article and the media it references. " +
      "Be concise and concrete. Cite items by title when relevant.";

    const result = streamText({
      model,
      system: buildSystem(baseSystem, style),
      prompt: `Article draft:\n---\n${document}\n---\n\nItems:\n${linkedItemsBlock}\n\nUser: ${instruction}`,
    });

    return result.toTextStreamResponse();
  },
);

function baseWritingSystem(action: string): string {
  switch (action) {
    case "continue":
      return "You continue the user's draft in the same voice, tone, and tense. Output the continuation only, no preamble.";
    case "rewrite":
      return "You rewrite the user's selection for clarity while preserving voice and meaning. Output the rewrite only.";
    case "summarize":
      return "You produce a concise summary of the user's article. Output the summary only.";
    case "suggest_title":
      return "You suggest 5 concise, evocative titles for the article. Output them as a plain numbered list.";
    case "suggest_tags":
      return "You suggest 5-10 relevant tags for the article. Output as a comma-separated list, lowercase, hyphens for multi-word tags.";
    default:
      return "You are a writing assistant.";
  }
}

function buildUserPrompt(
  req: { action: string; selection?: string; document?: string; instruction?: string },
  linkedItems: string,
): string {
  const parts: string[] = [];
  if (req.document) parts.push(`Full article:\n---\n${req.document}\n---`);
  if (req.selection) parts.push(`Selection:\n---\n${req.selection}\n---`);
  if (linkedItems) parts.push(linkedItems.trim());
  if (req.instruction) parts.push(`User instruction: ${req.instruction}`);
  parts.push(`Action: ${req.action}`);
  return parts.join("\n\n");
}
