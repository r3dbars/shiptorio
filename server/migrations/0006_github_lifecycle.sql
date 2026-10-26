-- Names remain aliases for HTTP URLs; Durable Objects use the immutable GitHub ID.
ALTER TABLE repos ADD COLUMN repo_id INTEGER;
CREATE UNIQUE INDEX repos_github_id ON repos(repo_id);
ALTER TABLE repos ADD COLUMN archived_at INTEGER;
ALTER TABLE repos ADD COLUMN archive_reason TEXT;
ALTER TABLE installations ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE installations ADD COLUMN permissions TEXT;
ALTER TABLE installations ADD COLUMN account_type TEXT;
ALTER TABLE installations ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE github_authorization_revocations (login TEXT PRIMARY KEY, revoked_at INTEGER NOT NULL);
