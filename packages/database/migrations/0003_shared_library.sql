-- Shared library refactor: works + people become a shared catalog.
--   - works.user_id  → works.owner_id (nullable; NULL = global, set = private)
--   - people.user_id → people.owner_id (nullable, same semantics)
--   - Per-user state (rating, status, notes, completed_at) moves off works
--     and seasons into a new `shelves` table keyed by (user, work, season?).
--   - works.notes → works.synopsis (reference data, kept alongside the work).
-- Conservative data migration: every existing row stays private (owner_id
-- carries over the original user_id). No automatic dedup of cross-user
-- duplicates — future adds through the lookup flow will create globals.

PRAGMA foreign_keys = OFF;

-- ========== Drop FTS + its triggers (they reference works.notes) ==========
DROP TRIGGER IF EXISTS `works_ai`;
DROP TRIGGER IF EXISTS `works_ad`;
DROP TRIGGER IF EXISTS `works_au`;
DROP TABLE IF EXISTS `works_fts`;

-- ========== works: recreate with nullable owner_id ==========
DROP INDEX IF EXISTS `works_user_idx`;
DROP INDEX IF EXISTS `works_user_kind_idx`;
DROP INDEX IF EXISTS `works_user_status_idx`;

CREATE TABLE `works_new` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `owner_id` TEXT REFERENCES `users`(`id`) ON DELETE CASCADE,
  `kind` TEXT NOT NULL,
  `title` TEXT NOT NULL,
  `year` INTEGER,
  `release_date` TEXT,
  `synopsis` TEXT,
  `cover_url` TEXT,
  `external_ids` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO `works_new` (
  `id`, `owner_id`, `kind`, `title`, `year`, `release_date`,
  `synopsis`, `cover_url`, `external_ids`, `created_at`, `updated_at`
)
SELECT
  `id`, `user_id`, `kind`, `title`, `year`, `release_date`,
  `notes`, `cover_url`, `external_ids`, `created_at`, `updated_at`
FROM `works`;

-- ========== people: recreate with nullable owner_id ==========
DROP INDEX IF EXISTS `people_user_idx`;
DROP INDEX IF EXISTS `people_user_name_idx`;

CREATE TABLE `people_new` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `owner_id` TEXT REFERENCES `users`(`id`) ON DELETE CASCADE,
  `name` TEXT NOT NULL,
  `kind` TEXT NOT NULL DEFAULT 'person',
  `external_ids` TEXT,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

INSERT INTO `people_new` (
  `id`, `owner_id`, `name`, `kind`, `external_ids`, `created_at`, `updated_at`
)
SELECT
  `id`, `user_id`, `name`, `kind`, `external_ids`, `created_at`, `updated_at`
FROM `people`;

-- ========== shelves: new table, populated from old per-user fields ==========
CREATE TABLE `shelves` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `work_id` INTEGER NOT NULL REFERENCES `works`(`id`) ON DELETE CASCADE,
  `season_id` INTEGER REFERENCES `seasons`(`id`) ON DELETE CASCADE,
  `status` TEXT NOT NULL DEFAULT 'wishlist',
  `rating` INTEGER,
  `notes` TEXT,
  `completed_at` INTEGER,
  `created_at` INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Work-level shelves, one per existing work (old user_id becomes shelf owner).
-- Old works.notes moved to works_new.synopsis; shelves.notes starts NULL.
INSERT INTO `shelves` (
  `user_id`, `work_id`, `season_id`,
  `status`, `rating`, `notes`, `completed_at`,
  `created_at`, `updated_at`
)
SELECT
  `user_id`, `id`, NULL,
  `status`, `rating`, NULL, `completed_at`,
  `created_at`, `created_at`
FROM `works`;

-- Season-level shelves. Seasons have no user_id of their own; derive it from
-- the parent work.
INSERT INTO `shelves` (
  `user_id`, `work_id`, `season_id`,
  `status`, `rating`, `notes`, `completed_at`,
  `created_at`, `updated_at`
)
SELECT
  w.`user_id`, s.`work_id`, s.`id`,
  s.`status`, s.`rating`, s.`notes`, s.`completed_at`,
  s.`created_at`, s.`created_at`
FROM `seasons` s
INNER JOIN `works` w ON w.`id` = s.`work_id`;

CREATE INDEX `shelves_user_idx` ON `shelves` (`user_id`);
CREATE INDEX `shelves_user_work_idx` ON `shelves` (`user_id`, `work_id`);
CREATE INDEX `shelves_user_status_idx` ON `shelves` (`user_id`, `status`);
-- Partial unique indexes: one work-level shelf per user, one per season.
CREATE UNIQUE INDEX `shelves_user_work_uq`
  ON `shelves` (`user_id`, `work_id`) WHERE `season_id` IS NULL;
CREATE UNIQUE INDEX `shelves_user_work_season_uq`
  ON `shelves` (`user_id`, `work_id`, `season_id`) WHERE `season_id` IS NOT NULL;

-- ========== seasons: drop per-user columns in place ==========
ALTER TABLE `seasons` DROP COLUMN `rating`;
ALTER TABLE `seasons` DROP COLUMN `status`;
ALTER TABLE `seasons` DROP COLUMN `notes`;
ALTER TABLE `seasons` DROP COLUMN `completed_at`;

-- ========== Swap in works_new and people_new ==========
-- FKs from seasons.work_id, work_credits.work_id, work_tags.work_id,
-- article_works.work_id, shelves.work_id point to `works` by name. After the
-- drop + rename, SQLite auto-updates those references.
DROP TABLE `works`;
ALTER TABLE `works_new` RENAME TO `works`;

DROP TABLE `people`;
ALTER TABLE `people_new` RENAME TO `people`;

CREATE INDEX `works_owner_idx` ON `works` (`owner_id`);
CREATE INDEX `works_kind_idx` ON `works` (`kind`);
CREATE INDEX `works_owner_kind_idx` ON `works` (`owner_id`, `kind`);

CREATE INDEX `people_owner_idx` ON `people` (`owner_id`);
CREATE INDEX `people_name_idx` ON `people` (`name`);

-- ========== Rebuild FTS against works.synopsis ==========
CREATE VIRTUAL TABLE `works_fts` USING fts5(
  title,
  synopsis,
  content='works',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

INSERT INTO `works_fts`(rowid, title, synopsis)
SELECT `id`, `title`, COALESCE(`synopsis`, '') FROM `works`;

CREATE TRIGGER `works_ai` AFTER INSERT ON `works` BEGIN
  INSERT INTO works_fts(rowid, title, synopsis) VALUES (new.id, new.title, COALESCE(new.synopsis, ''));
END;

CREATE TRIGGER `works_ad` AFTER DELETE ON `works` BEGIN
  INSERT INTO works_fts(works_fts, rowid, title, synopsis) VALUES('delete', old.id, old.title, COALESCE(old.synopsis, ''));
END;

CREATE TRIGGER `works_au` AFTER UPDATE ON `works` BEGIN
  INSERT INTO works_fts(works_fts, rowid, title, synopsis) VALUES('delete', old.id, old.title, COALESCE(old.synopsis, ''));
  INSERT INTO works_fts(rowid, title, synopsis) VALUES (new.id, new.title, COALESCE(new.synopsis, ''));
END;

PRAGMA foreign_keys = ON;
