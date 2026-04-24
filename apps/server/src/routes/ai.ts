import { works, memories, settings } from "@reel/database";
import {
  credentialsFromEnv,
  getModelInstance,
  resolveModel,
  type ModelSelection,
} from "@reel/ai-core";
import {
  adaptRequestSchema,
  modelSelectionSchema,
  writingRequestSchema,
  type Platform,
} from "@reel/shared";
import { streamText } from "ai";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
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
  let linkedWorksBlock = "";
  if (req.workIds.length) {
    const rows = await db
      .select()
      .from(works)
      .where(
        and(
          inArray(works.id, req.workIds),
          or(isNull(works.ownerId), eq(works.ownerId, user.id)),
        ),
      );
    if (rows.length) {
      linkedWorksBlock =
        "\n\nLinked works:\n" +
        rows
          .map((r) => `- [${r.kind}] ${r.title}${r.year ? ` (${r.year})` : ""}`)
          .join("\n");
    }
  }

  const system = buildSystem(baseWritingSystem(req.action), style);
  const prompt = buildUserPrompt(req, linkedWorksBlock);

  const result = streamText({ model, system, prompt });
  return result.toTextStreamResponse();
});

aiRouter.post(
  "/chat",
  zValidator(
    "json",
    z.object({
      document: z.string().optional().default(""),
      workIds: z.array(z.number().int()).default([]),
      instruction: z.string().optional().default(""),
    }),
  ),
  async (c) => {
    const user = c.get("user");
    const { document, workIds, instruction } = c.req.valid("json");

    const [override, style] = await Promise.all([
      loadModelOverride(c, user.id, "model:chat"),
      loadMemory(c, user.id, "style_writing"),
    ]);
    const selection = resolveModel("chat", c.env, override);
    const model = getModelInstance(selection, credentialsFromEnv(c.env));

    const db = getDb(c);
    let linkedWorksBlock = "";
    if (workIds.length) {
      const rows = await db
        .select()
        .from(works)
        .where(
          and(
            inArray(works.id, workIds),
            or(isNull(works.ownerId), eq(works.ownerId, user.id)),
          ),
        );
      linkedWorksBlock = rows
        .map((r) => `- [${r.kind}] ${r.title}${r.year ? ` (${r.year})` : ""}`)
        .join("\n");
    }

    const baseSystem =
      "You are a helpful assistant discussing the user's article and the media it references. " +
      "Be concise and concrete. Cite works by title when relevant.";

    const result = streamText({
      model,
      system: buildSystem(baseSystem, style),
      prompt: `Article draft:\n---\n${document}\n---\n\nWorks:\n${linkedWorksBlock}\n\nUser: ${instruction}`,
    });

    return result.toTextStreamResponse();
  },
);

// Prompt registry for /ai/adapt. Keyed on Platform so the type system forces
// a prompt to exist for every platform in the shared schema. Adding a new
// platform: add the enum entry in packages/shared, add a prompt here, add a
// transform in apps/web/src/lib/platforms.
const ADAPT_PROMPTS: Record<Platform, string> = {
  medium:
    "You are adapting a Markdown article for Medium. Keep the author's voice, tone, and argument. " +
    "Output valid Markdown only — no commentary, no preamble, no code fences around the whole output. " +
    "Medium renders Markdown faithfully, so preserve headings, lists, quotes, and images as-is. " +
    "You may lightly tighten prose, but do not remove sections or change meaning.",
  wechat:
    "You are adapting a Markdown article for 微信公众号 (WeChat Official Account). " +
    "Rewrite in fluent 中文 (translate only if the source is not Chinese). " +
    "Structure it for WeChat reading habits: a hook opening, frequent short paragraphs, clear section headings, " +
    "and occasional emphasis. Preserve the author's point of view and factual claims. " +
    "Output valid Markdown only — no commentary, no preamble.",
  x:
    "You are adapting a Markdown article into an X (Twitter) thread. " +
    "Output a numbered thread, one tweet per line, each strictly ≤ 270 characters " +
    "(leave headroom for the thread counter the client will add). " +
    "Use the format: `1/ …`, `2/ …`, etc. " +
    "Open with a hook tweet. Preserve the article's key claims and any concrete examples. " +
    "Plain text only — no Markdown syntax, no hashtag spam (≤ 2 hashtags total, only if genuinely useful).",
  xiaohongshu:
    "You are adapting a Markdown article into a 小红书 (Xiaohongshu / RedNote) post. " +
    "Rewrite in 中文. Structure: a punchy title-hook line, then short paragraphs with line breaks between them, " +
    "liberal emojis where natural, and 3–6 relevant hashtags at the very end on a single line prefixed with '#'. " +
    "Tone: personal, warm, conversational — not corporate. " +
    "Plain text only, no Markdown headings or lists.",
};

aiRouter.post("/adapt", zValidator("json", adaptRequestSchema), async (c) => {
  const user = c.get("user");
  const { platform, markdown } = c.req.valid("json");

  const [override, style] = await Promise.all([
    loadModelOverride(c, user.id, "model:writing"),
    loadMemory(c, user.id, "style_writing"),
  ]);
  const selection = resolveModel("writing", c.env, override);
  const model = getModelInstance(selection, credentialsFromEnv(c.env));

  const system = buildSystem(ADAPT_PROMPTS[platform], style);
  const result = streamText({
    model,
    system,
    prompt: `Source article (Markdown):\n---\n${markdown}\n---\n\nRewrite for ${platform}.`,
  });
  return result.toTextStreamResponse();
});

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
  linkedWorks: string,
): string {
  const parts: string[] = [];
  if (req.document) parts.push(`Full article:\n---\n${req.document}\n---`);
  if (req.selection) parts.push(`Selection:\n---\n${req.selection}\n---`);
  if (linkedWorks) parts.push(linkedWorks.trim());
  if (req.instruction) parts.push(`User instruction: ${req.instruction}`);
  parts.push(`Action: ${req.action}`);
  return parts.join("\n\n");
}
