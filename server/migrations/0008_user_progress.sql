-- Progression (shared/src/progression.ts) follows the player across browsers and devices: one JSON blob
-- per user, validated by the shared schema on write. Last write wins; the web merges before writing.
CREATE TABLE IF NOT EXISTS user_progress (
  user_id INTEGER PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
