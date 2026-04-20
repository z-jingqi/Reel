import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

export const ITEM_KINDS = ["movie", "tv", "book", "game"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_STATUSES = [
  "wishlist",
  "active",
  "finished",
  "dropped",
  "paused",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const PERSON_KINDS = ["person", "studio"] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export const USER_ROLES = ["admin", "user"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// ---------- auth ----------

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    salt: text("salt").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull().default("user"),
    ...timestamps,
  },
  (t) => ({
    usernameUq: uniqueIndex("users_username_uq").on(t.username),
  }),
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    userIdx: index("sessions_user_idx").on(t.userId),
    expiresIdx: index("sessions_expires_idx").on(t.expiresAt),
  }),
);

export const inviteCodes = sqliteTable(
  "invite_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usedBy: text("used_by").references(() => users.id, { onDelete: "set null" }),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    codeUq: uniqueIndex("invite_codes_code_uq").on(t.code),
    createdByIdx: index("invite_codes_created_by_idx").on(t.createdBy),
  }),
);

// ---------- library ----------

export const items = sqliteTable(
  "items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ITEM_KINDS }).notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    releaseDate: text("release_date"),
    rating: integer("rating"),
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("wishlist"),
    notes: text("notes"),
    coverUrl: text("cover_url"),
    externalIds: text("external_ids", { mode: "json" }).$type<Record<string, string | number>>(),
    completedAt: integer("completed_at"),
    ...timestamps,
  },
  (t) => ({
    userIdx: index("items_user_idx").on(t.userId),
    userKindIdx: index("items_user_kind_idx").on(t.userId, t.kind),
    userStatusIdx: index("items_user_status_idx").on(t.userId, t.status),
  }),
);

export const seasons = sqliteTable(
  "seasons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title"),
    year: integer("year"),
    rating: integer("rating"),
    status: text("status", { enum: ITEM_STATUSES }).notNull().default("wishlist"),
    notes: text("notes"),
    completedAt: integer("completed_at"),
    ...timestamps,
  },
  (t) => ({
    itemNumberUq: uniqueIndex("seasons_item_number_uq").on(t.itemId, t.number),
  }),
);

export const people = sqliteTable(
  "people",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: PERSON_KINDS }).notNull().default("person"),
    externalIds: text("external_ids", { mode: "json" }).$type<Record<string, string | number>>(),
    ...timestamps,
  },
  (t) => ({
    userIdx: index("people_user_idx").on(t.userId),
    userNameIdx: index("people_user_name_idx").on(t.userId, t.name),
  }),
);

export const itemCredits = sqliteTable(
  "item_credits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    personId: integer("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    character: text("character"),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    itemIdx: index("item_credits_item_idx").on(t.itemId),
    personIdx: index("item_credits_person_idx").on(t.personId),
  }),
);

// ---------- articles ----------

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    bodyJson: text("body_json").notNull().default("{}"),
    bodyText: text("body_text").notNull().default(""),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    userSlugUq: uniqueIndex("articles_user_slug_uq").on(t.userId, t.slug),
    userPinnedIdx: index("articles_user_pinned_idx").on(t.userId, t.pinned),
  }),
);

export const articleItems = sqliteTable(
  "article_items",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.itemId] }),
    itemIdx: index("article_items_item_idx").on(t.itemId),
  }),
);

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (t) => ({
    userSlugUq: uniqueIndex("categories_user_slug_uq").on(t.userId, t.slug),
    userNameUq: uniqueIndex("categories_user_name_uq").on(t.userId, t.name),
  }),
);

export const articleCategories = sqliteTable(
  "article_categories",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.categoryId] }),
  }),
);

export const references = sqliteTable(
  "references",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => ({
    userIdx: index("references_user_idx").on(t.userId),
  }),
);

export const referenceLinks = sqliteTable(
  "reference_links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referenceId: integer("reference_id")
      .notNull()
      .references(() => references.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    referenceIdx: index("reference_links_reference_idx").on(t.referenceId),
  }),
);

export const articleRefs = sqliteTable(
  "article_refs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    referenceId: integer("reference_id")
      .notNull()
      .references(() => references.id, { onDelete: "restrict" }),
    position: integer("position").notNull().default(0),
  },
  (t) => ({
    articleIdx: index("article_refs_article_idx").on(t.articleId),
    referenceIdx: index("article_refs_reference_idx").on(t.referenceId),
  }),
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (t) => ({
    userSlugUq: uniqueIndex("tags_user_slug_uq").on(t.userId, t.slug),
    userNameUq: uniqueIndex("tags_user_name_uq").on(t.userId, t.name),
  }),
);

export const itemTags = sqliteTable(
  "item_tags",
  {
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.itemId, t.tagId] }),
  }),
);

export const articleTags = sqliteTable(
  "article_tags",
  {
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.articleId, t.tagId] }),
  }),
);

// ---------- settings + memories ----------

export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.key] }),
  }),
);

export const memories = sqliteTable(
  "memories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    userKindUq: uniqueIndex("memories_user_kind_uq").on(t.userId, t.kind),
  }),
);

// ---------- inferred types ----------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type Person = typeof people.$inferSelect;
export type NewPerson = typeof people.$inferInsert;
export type ItemCredit = typeof itemCredits.$inferSelect;
export type NewItemCredit = typeof itemCredits.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Reference = typeof references.$inferSelect;
export type NewReference = typeof references.$inferInsert;
export type ReferenceLink = typeof referenceLinks.$inferSelect;
export type NewReferenceLink = typeof referenceLinks.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type SettingsRow = typeof settings.$inferSelect;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
