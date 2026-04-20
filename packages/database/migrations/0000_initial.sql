-- Initial schema for Reel.
-- Generated to match packages/database/src/schema.ts.
-- After editing schema.ts, run `pnpm db:generate` to produce follow-up migrations.

-- ---------- auth ----------

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `password_hash` text NOT NULL,
  `salt` text NOT NULL,
  `role` text DEFAULT 'user' NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX `users_username_uq` ON `users` (`username`);

CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `expires_at` integer NOT NULL,
  `last_active_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);

CREATE TABLE `invite_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `created_by` text NOT NULL,
  `used_by` text,
  `used_at` integer,
  `expires_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);
CREATE UNIQUE INDEX `invite_codes_code_uq` ON `invite_codes` (`code`);
CREATE INDEX `invite_codes_created_by_idx` ON `invite_codes` (`created_by`);

-- ---------- library ----------

CREATE TABLE `items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `year` integer,
  `release_date` text,
  `rating` integer,
  `status` text DEFAULT 'wishlist' NOT NULL,
  `notes` text,
  `cover_url` text,
  `external_ids` text,
  `completed_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `items_user_idx` ON `items` (`user_id`);
CREATE INDEX `items_user_kind_idx` ON `items` (`user_id`, `kind`);
CREATE INDEX `items_user_status_idx` ON `items` (`user_id`, `status`);

CREATE TABLE `seasons` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `item_id` integer NOT NULL,
  `number` integer NOT NULL,
  `title` text,
  `year` integer,
  `rating` integer,
  `status` text DEFAULT 'wishlist' NOT NULL,
  `notes` text,
  `completed_at` integer,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `seasons_item_number_uq` ON `seasons` (`item_id`, `number`);

CREATE TABLE `people` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `kind` text DEFAULT 'person' NOT NULL,
  `external_ids` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `people_user_idx` ON `people` (`user_id`);
CREATE INDEX `people_user_name_idx` ON `people` (`user_id`, `name`);

CREATE TABLE `item_credits` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `item_id` integer NOT NULL,
  `person_id` integer NOT NULL,
  `role` text NOT NULL,
  `character` text,
  `position` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON DELETE RESTRICT
);
CREATE INDEX `item_credits_item_idx` ON `item_credits` (`item_id`);
CREATE INDEX `item_credits_person_idx` ON `item_credits` (`person_id`);

-- ---------- articles ----------

CREATE TABLE `articles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `slug` text NOT NULL,
  `title` text NOT NULL,
  `body_json` text DEFAULT '{}' NOT NULL,
  `body_text` text DEFAULT '' NOT NULL,
  `pinned` integer DEFAULT 0 NOT NULL,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `articles_user_slug_uq` ON `articles` (`user_id`, `slug`);
CREATE INDEX `articles_user_pinned_idx` ON `articles` (`user_id`, `pinned`);

CREATE TABLE `article_items` (
  `article_id` integer NOT NULL,
  `item_id` integer NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`article_id`, `item_id`),
  FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
);
CREATE INDEX `article_items_item_idx` ON `article_items` (`item_id`);

CREATE TABLE `categories` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `categories_user_slug_uq` ON `categories` (`user_id`, `slug`);
CREATE UNIQUE INDEX `categories_user_name_uq` ON `categories` (`user_id`, `name`);

CREATE TABLE `article_categories` (
  `article_id` integer NOT NULL,
  `category_id` integer NOT NULL,
  PRIMARY KEY (`article_id`, `category_id`),
  FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE
);

CREATE TABLE `references` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `title` text NOT NULL,
  `note` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX `references_user_idx` ON `references` (`user_id`);

CREATE TABLE `reference_links` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `reference_id` integer NOT NULL,
  `url` text NOT NULL,
  `label` text,
  `position` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON DELETE CASCADE
);
CREATE INDEX `reference_links_reference_idx` ON `reference_links` (`reference_id`);

CREATE TABLE `article_refs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `article_id` integer NOT NULL,
  `reference_id` integer NOT NULL,
  `position` integer DEFAULT 0 NOT NULL,
  FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`reference_id`) REFERENCES `references`(`id`) ON DELETE RESTRICT
);
CREATE INDEX `article_refs_article_idx` ON `article_refs` (`article_id`);
CREATE INDEX `article_refs_reference_idx` ON `article_refs` (`reference_id`);

CREATE TABLE `tags` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `slug` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `tags_user_slug_uq` ON `tags` (`user_id`, `slug`);
CREATE UNIQUE INDEX `tags_user_name_uq` ON `tags` (`user_id`, `name`);

CREATE TABLE `item_tags` (
  `item_id` integer NOT NULL,
  `tag_id` integer NOT NULL,
  PRIMARY KEY (`item_id`, `tag_id`),
  FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE
);

CREATE TABLE `article_tags` (
  `article_id` integer NOT NULL,
  `tag_id` integer NOT NULL,
  PRIMARY KEY (`article_id`, `tag_id`),
  FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE
);

-- ---------- settings + memories ----------

CREATE TABLE `settings` (
  `user_id` text NOT NULL,
  `key` text NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  PRIMARY KEY (`user_id`, `key`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `memories` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `user_id` text NOT NULL,
  `kind` text NOT NULL,
  `content` text NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX `memories_user_kind_uq` ON `memories` (`user_id`, `kind`);
