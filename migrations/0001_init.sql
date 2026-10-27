-- Every diary document, stored by path (see docs/data-model.md and docs/sync.md).
CREATE TABLE docs (
  path        TEXT PRIMARY KEY,          -- e.g. 'sites/cafe/days/2026-10-27'
  collection  TEXT NOT NULL,             -- e.g. 'sites/cafe/days'
  doc_id      TEXT NOT NULL,             -- e.g. '2026-10-27'
  data        TEXT,                      -- JSON; NULL when deleted
  updated_at  INTEGER NOT NULL,          -- ms since epoch
  source      TEXT NOT NULL,             -- 'web' (edited on the website) or 'claude' (written by sync)
  deleted     INTEGER NOT NULL DEFAULT 0,-- tombstone, so the sync can see website deletions
  claude_data TEXT,                      -- the JSON Claude last applied for this path (NULL = Claude had no doc)
  seq         INTEGER NOT NULL DEFAULT 0,-- change counter used by the page's live polling
  updated_by  TEXT                       -- 'web:<name>' or 'sync', for auditing
);
CREATE INDEX docs_collection ON docs(collection, deleted);
CREATE INDEX docs_web_changes ON docs(source, updated_at);
CREATE INDEX docs_collection_seq ON docs(collection, seq);

-- Small key/value table: 'seq' (bumped on every write) and 'lastApplyAt'.
CREATE TABLE meta (
  k TEXT PRIMARY KEY,
  v INTEGER NOT NULL
);
INSERT INTO meta (k, v) VALUES ('seq', 0), ('lastApplyAt', 0);

-- Per-IP write counters for rate limiting.
CREATE TABLE rate_limits (
  ip     TEXT NOT NULL,
  window INTEGER NOT NULL,               -- start of the 15-minute window, ms since epoch
  n      INTEGER NOT NULL,
  PRIMARY KEY (ip, window)
);
