-- Operator actions are separate from player sessions and never grant launch proof.
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY, at INTEGER NOT NULL, admin_login TEXT NOT NULL,
  action TEXT NOT NULL, target_repo TEXT, target_user TEXT, detail_json TEXT NOT NULL
);
CREATE INDEX admin_audit_at ON admin_audit(at DESC);
CREATE TABLE admin_views (
  id_hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL, admin_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL, repo TEXT NOT NULL, writable INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_views_expiry ON admin_views(expires_at);
CREATE TABLE admin_controls (scope TEXT PRIMARY KEY, paused INTEGER NOT NULL DEFAULT 0);
-- Override daily ceilings without changing admission or deleting historical usage.
CREATE TABLE admin_user_limits (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  runs INTEGER, spark_calls INTEGER, spark_tokens INTEGER
);
