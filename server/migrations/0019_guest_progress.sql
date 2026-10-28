-- Sample-factory progress only; guest IDs never grant account or repository access.
CREATE TABLE IF NOT EXISTS guests (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  progress_json TEXT NOT NULL DEFAULT '{"progress":null,"prefs":{}}'
);
CREATE INDEX IF NOT EXISTS guests_last_seen ON guests(last_seen_at);
