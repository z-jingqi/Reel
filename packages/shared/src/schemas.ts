import { z } from "zod";

// Philosophy for a private app:
// - Require only what must not be empty (the "name" of a thing).
// - Keep enums (they constrain DB semantics).
// - Keep rating 1–10 (that's what the UI is).
// - Drop everything else: no URL checks, no regex slugs, no year ranges,
//   no max-length caps (within sanity). Users can put in whatever.

const nonEmpty = z.string().trim().min(1);
const optionalText = z.string().optional().nullable();

// ---------- auth ----------

export const usernameSchema = z
  .string()
  .trim()
  .min(2)
  .regex(/^[^\s]+$/, "username can't contain spaces");

export const passwordSchema = z.string().min(6);

export const signupInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: z.string().min(1).optional(),
});
export type SignupInput = z.infer<typeof signupInputSchema>;

export const signinInputSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});
export type SigninInput = z.infer<typeof signinInputSchema>;

export const inviteCreateInputSchema = z
  .object({
    expiresAt: z.number().int().optional().nullable(),
  })
  .default({});
export type InviteCreateInput = z.infer<typeof inviteCreateInputSchema>;

// ---------- library ----------

export const workKindSchema = z.enum(["movie", "tv", "book", "game"]);
export type WorkKind = z.infer<typeof workKindSchema>;

export const workStatusSchema = z.enum([
  "wishlist",
  "active",
  "finished",
  "dropped",
  "paused",
]);
export type WorkStatus = z.infer<typeof workStatusSchema>;

export const personKindSchema = z.enum(["person", "studio"]);
export type PersonKind = z.infer<typeof personKindSchema>;

export const releaseDateSchema = z.string().trim().min(1);

export const creditInlineSchema = z.object({
  name: nonEmpty,
  kind: personKindSchema.default("person"),
  role: nonEmpty,
  character: optionalText,
  externalIds: z.record(z.union([z.string(), z.number()])).optional().nullable(),
});
export type CreditInline = z.infer<typeof creditInlineSchema>;

// Reference fields for a work — shared on globals, editable by the owner on
// privates. Per-user state (rating, status, notes, completedAt) lives in
// shelfInputSchema below. The HTTP endpoints accept a combined body and split
// the write server-side so the client can keep sending one payload.
export const workInputSchema = z.object({
  kind: workKindSchema,
  title: nonEmpty,
  year: z.number().int().optional().nullable(),
  releaseDate: releaseDateSchema.optional().nullable(),
  synopsis: optionalText,
  coverUrl: optionalText,
  externalIds: z.record(z.union([z.string(), z.number()])).optional().nullable(),
  credits: z.array(creditInlineSchema).optional(),
});
export type WorkInput = z.infer<typeof workInputSchema>;

export const shelfInputSchema = z.object({
  status: workStatusSchema.default("wishlist"),
  rating: z.number().int().min(1).max(10).optional().nullable(),
  notes: optionalText,
  completedAt: z.number().int().optional().nullable(),
});
export type ShelfInput = z.infer<typeof shelfInputSchema>;

// Combined body accepted by POST/PATCH /api/works. Server splits reference
// fields into `works` and shelf fields into `shelves`.
export const workWithShelfInputSchema = workInputSchema.merge(
  shelfInputSchema.partial(),
);
export type WorkWithShelfInput = z.infer<typeof workWithShelfInputSchema>;

export const seasonInputSchema = z.object({
  workId: z.number().int(),
  number: z.number().int().min(0),
  title: optionalText,
  year: z.number().int().optional().nullable(),
});
export type SeasonInput = z.infer<typeof seasonInputSchema>;

// Accepted by shelf endpoints that target a season.
export const seasonShelfInputSchema = shelfInputSchema.extend({
  seasonId: z.number().int(),
});
export type SeasonShelfInput = z.infer<typeof seasonShelfInputSchema>;

export const personInputSchema = z.object({
  name: nonEmpty,
  kind: personKindSchema.default("person"),
  externalIds: z.record(z.union([z.string(), z.number()])).optional().nullable(),
});
export type PersonInput = z.infer<typeof personInputSchema>;

export const creditInputSchema = z.object({
  workId: z.number().int(),
  personId: z.number().int(),
  role: nonEmpty,
  character: optionalText,
  position: z.number().int().min(0).default(0),
});
export type CreditInput = z.infer<typeof creditInputSchema>;

export const articleInputSchema = z.object({
  // Slug optional; if omitted the server derives it from title.
  slug: z.string().trim().min(1).optional(),
  title: nonEmpty,
  bodyJson: z.string().default("{}"),
  bodyText: z.string().default(""),
  pinned: z.boolean().default(false),
  workIds: z.array(z.number().int()).default([]),
  categoryIds: z.array(z.number().int()).default([]),
  tagIds: z.array(z.number().int()).default([]),
});
export type ArticleInput = z.infer<typeof articleInputSchema>;

export const categoryInputSchema = z.object({
  name: nonEmpty,
  slug: z.string().trim().min(1).optional(),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const referenceInputSchema = z.object({
  title: nonEmpty,
  note: optionalText,
  links: z
    .array(
      z.object({
        url: nonEmpty,
        label: optionalText,
      }),
    )
    .default([]),
});
export type ReferenceInput = z.infer<typeof referenceInputSchema>;

export const tagInputSchema = z.object({
  name: nonEmpty,
  slug: z.string().trim().min(1).optional(),
});
export type TagInput = z.infer<typeof tagInputSchema>;

// ---------- AI / settings / memories ----------

export const providerSchema = z.enum([
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "openrouter",
  "cloudflare",
]);

export const modelSelectionSchema = z.object({
  provider: providerSchema,
  modelId: nonEmpty,
});
export type ModelSelectionInput = z.infer<typeof modelSelectionSchema>;

export const writingActionSchema = z.enum([
  "continue",
  "rewrite",
  "summarize",
  "suggest_title",
  "suggest_tags",
]);
export type WritingAction = z.infer<typeof writingActionSchema>;

export const writingRequestSchema = z.object({
  action: writingActionSchema,
  selection: z.string().optional(),
  document: z.string().optional(),
  instruction: z.string().optional(),
  workIds: z.array(z.number().int()).default([]),
});
export type WritingRequest = z.infer<typeof writingRequestSchema>;

// Target platforms for the preview + copy feature. Add new ids here first —
// the rest of the stack (server prompt registry, web registry) keys off this
// union. The feature is preview-and-paste only; no API integrations.
export const platformSchema = z.enum(["medium", "wechat", "x", "xiaohongshu"]);
export type Platform = z.infer<typeof platformSchema>;

// Request body for POST /api/ai/adapt — AI rewrites the source Markdown in
// the target platform's voice/structure. Output streams back as Markdown.
export const adaptRequestSchema = z.object({
  platform: platformSchema,
  markdown: z.string(),
  theme: z.string().optional(),
});
export type AdaptRequest = z.infer<typeof adaptRequestSchema>;

export const memoryKindSchema = z.enum(["style_writing", "style_about"]);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const memoryUpsertSchema = z.object({
  content: nonEmpty,
});
export type MemoryUpsert = z.infer<typeof memoryUpsertSchema>;

export const memoryAnalyzeSchema = z
  .object({
    sampleCount: z.number().int().min(1).max(20).default(6),
  })
  .partial();

// ---------- lookup (auto-fill) ----------

export const lookupSourceSchema = z.enum(["tmdb", "google_books", "rawg"]);
export type LookupSource = z.infer<typeof lookupSourceSchema>;

export const lookupCandidateSchema = z.object({
  source: lookupSourceSchema,
  externalId: z.string(),
  title: z.string(),
  year: z.number().int().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  posterUrl: z.string().nullable().optional(),
  synopsis: z.string().nullable().optional(),
});
export type LookupCandidate = z.infer<typeof lookupCandidateSchema>;

export const lookupDetailSchema = lookupCandidateSchema.extend({
  credits: z.array(creditInlineSchema).default([]),
});
export type LookupDetail = z.infer<typeof lookupDetailSchema>;
