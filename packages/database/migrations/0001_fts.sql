-- Full-text search virtual tables + triggers to keep them in sync.

CREATE VIRTUAL TABLE `items_fts` USING fts5(
  title,
  notes,
  content='items',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER `items_ai` AFTER INSERT ON `items` BEGIN
  INSERT INTO items_fts(rowid, title, notes) VALUES (new.id, new.title, COALESCE(new.notes, ''));
END;

CREATE TRIGGER `items_ad` AFTER DELETE ON `items` BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, notes) VALUES('delete', old.id, old.title, COALESCE(old.notes, ''));
END;

CREATE TRIGGER `items_au` AFTER UPDATE ON `items` BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, notes) VALUES('delete', old.id, old.title, COALESCE(old.notes, ''));
  INSERT INTO items_fts(rowid, title, notes) VALUES (new.id, new.title, COALESCE(new.notes, ''));
END;

CREATE VIRTUAL TABLE `articles_fts` USING fts5(
  title,
  body_text,
  content='articles',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER `articles_ai` AFTER INSERT ON `articles` BEGIN
  INSERT INTO articles_fts(rowid, title, body_text) VALUES (new.id, new.title, new.body_text);
END;

CREATE TRIGGER `articles_ad` AFTER DELETE ON `articles` BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, body_text) VALUES('delete', old.id, old.title, old.body_text);
END;

CREATE TRIGGER `articles_au` AFTER UPDATE ON `articles` BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, body_text) VALUES('delete', old.id, old.title, old.body_text);
  INSERT INTO articles_fts(rowid, title, body_text) VALUES (new.id, new.title, new.body_text);
END;
