-- Forward-only: fail on orphaned repositories rather than silently discard rows.
-- New account tables are owned by 0004_accounts, not rebuilt here.
ALTER TABLE installations ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE installations SET updated_at = created_at;
CREATE TRIGGER installations_insert_timestamp AFTER INSERT ON installations
WHEN NEW.updated_at = '' BEGIN
  UPDATE installations SET updated_at = NEW.created_at WHERE id = NEW.id;
END;
CREATE TRIGGER installations_update_timestamp AFTER UPDATE ON installations
WHEN NEW.updated_at = OLD.updated_at AND NEW.updated_at <> datetime('now') BEGIN
  UPDATE installations SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE repos_durable (
  full_name TEXT PRIMARY KEY NOT NULL,
  installation_id INTEGER NOT NULL REFERENCES installations(id) ON DELETE RESTRICT,
  default_branch TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO repos_durable (full_name, installation_id, default_branch, created_at, updated_at)
SELECT full_name, installation_id, default_branch, updated_at, updated_at FROM repos;
DROP TABLE repos;
ALTER TABLE repos_durable RENAME TO repos;
CREATE INDEX repos_installation ON repos(installation_id);
CREATE TRIGGER repos_update_timestamp AFTER UPDATE ON repos
WHEN NEW.updated_at = OLD.updated_at AND NEW.updated_at <> datetime('now') BEGIN
  UPDATE repos SET updated_at = datetime('now') WHERE full_name = NEW.full_name;
END;

ALTER TABLE pull_requests ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
UPDATE pull_requests SET created_at = updated_at;
CREATE TRIGGER pull_requests_insert_timestamp AFTER INSERT ON pull_requests
WHEN NEW.created_at = '' BEGIN
  UPDATE pull_requests SET created_at = NEW.updated_at WHERE repo = NEW.repo AND number = NEW.number;
END;
CREATE TRIGGER pull_requests_update_timestamp AFTER UPDATE ON pull_requests
WHEN NEW.updated_at = OLD.updated_at AND NEW.updated_at <> datetime('now') BEGIN
  UPDATE pull_requests SET updated_at = datetime('now') WHERE repo = NEW.repo AND number = NEW.number;
END;
-- Existing PK and head index cover lookup by repo/number and repo/head_sha.
CREATE INDEX pull_requests_state ON pull_requests(repo, state, updated_at);
-- Delivery cleanup is state='done' + expires_at; do not scan pending deliveries.
CREATE INDEX webhook_deliveries_done_expiry ON webhook_deliveries(expires_at) WHERE state = 'done';
