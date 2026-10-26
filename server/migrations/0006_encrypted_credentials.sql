-- D1 gives revocation and migration tombstones consistent reads; KV remains legacy input only.
CREATE TABLE IF NOT EXISTS credentials (
  scope TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sentry', 'posthog')),
  envelope TEXT,
  revoked INTEGER NOT NULL DEFAULT 0,
  linked INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  last_used_at INTEGER,
  PRIMARY KEY (scope, kind)
);
