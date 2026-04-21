-- Rename the `items` concept to `works` everywhere.
-- Affects: items, item_credits, item_tags, article_items, seasons.item_id,
-- plus indexes and the items_fts virtual table + triggers.

PRAGMA foreign_keys = OFF;

-- Drop FTS + triggers that reference `items` before renaming the base table.
DROP TRIGGER IF EXISTS `items_ai`;
DROP TRIGGER IF EXISTS `items_ad`;
DROP TRIGGER IF EXISTS `items_au`;
DROP TABLE IF EXISTS `items_fts`;

-- Drop old indexes that will be renamed.
DROP INDEX IF EXISTS `items_user_idx`;
DROP INDEX IF EXISTS `items_user_kind_idx`;
DROP INDEX IF EXISTS `items_user_status_idx`;
DROP INDEX IF EXISTS `seasons_item_number_uq`;
DROP INDEX IF EXISTS `item_credits_item_idx`;
DROP INDEX IF EXISTS `item_credits_person_idx`;
DROP INDEX IF EXISTS `article_items_item_idx`;

-- Rename tables. SQLite 3.25+ auto-updates FK references in other tables'
-- schema bodies, and D1 runs a recent SQLite build.
ALTER TABLE `items` RENAME TO `works`;
ALTER TABLE `item_credits` RENAME TO `work_credits`;
ALTER TABLE `item_tags` RENAME TO `work_tags`;
ALTER TABLE `article_items` RENAME TO `article_works`;

-- Rename `item_id` columns to `work_id` wherever they appear.
ALTER TABLE `seasons` RENAME COLUMN `item_id` TO `work_id`;
ALTER TABLE `work_credits` RENAME COLUMN `item_id` TO `work_id`;
ALTER TABLE `work_tags` RENAME COLUMN `item_id` TO `work_id`;
ALTER TABLE `article_works` RENAME COLUMN `item_id` TO `work_id`;

-- Recreate indexes with the new names.
CREATE INDEX `works_user_idx` ON `works` (`user_id`);
CREATE INDEX `works_user_kind_idx` ON `works` (`user_id`, `kind`);
CREATE INDEX `works_user_status_idx` ON `works` (`user_id`, `status`);
CREATE UNIQUE INDEX `seasons_work_number_uq` ON `seasons` (`work_id`, `number`);
CREATE INDEX `work_credits_work_idx` ON `work_credits` (`work_id`);
CREATE INDEX `work_credits_person_idx` ON `work_credits` (`person_id`);
CREATE INDEX `article_works_work_idx` ON `article_works` (`work_id`);

-- Rebuild FTS against the renamed table and backfill existing rows.
CREATE VIRTUAL TABLE `works_fts` USING fts5(
  title,
  notes,
  content='works',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER `works_ai` AFTER INSERT ON `works` BEGIN
  INSERT INTO works_fts(rowid, title, notes) VALUES (new.id, new.title, COALESCE(new.notes, ''));
END;

CREATE TRIGGER `works_ad` AFTER DELETE ON `works` BEGIN
  INSERT INTO works_fts(works_fts, rowid, title, notes) VALUES('delete', old.id, old.title, COALESCE(old.notes, ''));
END;

CREATE TRIGGER `works_au` AFTER UPDATE ON `works` BEGIN
  INSERT INTO works_fts(works_fts, rowid, title, notes) VALUES('delete', old.id, old.title, COALESCE(old.notes, ''));
  INSERT INTO works_fts(rowid, title, notes) VALUES (new.id, new.title, COALESCE(new.notes, ''));
END;

INSERT INTO works_fts(rowid, title, notes)
  SELECT id, title, COALESCE(notes, '') FROM works;

PRAGMA foreign_keys = ON;
