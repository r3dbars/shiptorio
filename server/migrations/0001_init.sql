CREATE TABLE installations (
  id INTEGER PRIMARY KEY,
  account_login TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE repos (
  full_name TEXT PRIMARY KEY,
  installation_id INTEGER NOT NULL,
  default_branch TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE pull_requests (
  repo TEXT NOT NULL,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,          -- open | closed | merged
  author TEXT,
  head_sha TEXT,
  ci_status TEXT,               -- pending | success | failure | null
  files TEXT,                   -- JSON array of changed paths
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (repo, number)
);

CREATE INDEX pull_requests_head ON pull_requests (repo, head_sha);
