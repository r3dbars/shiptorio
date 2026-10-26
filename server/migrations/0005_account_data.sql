-- Only anonymous receipts survive a successful deletion. Blocks prevent webhook retries
-- from rebuilding an erased factory; they contain a SHA-256 repo identifier, not its name.
CREATE TABLE account_deletion_receipts (
  id TEXT PRIMARY KEY,
  completed_at INTEGER NOT NULL,
  factory_count INTEGER NOT NULL
);
CREATE TABLE deleted_factories (
  repo_hash TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);
