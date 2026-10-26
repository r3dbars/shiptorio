-- Real player accounts. GitHub is the only login; there are no passwords.
-- users.id is the GitHub user id, so a renamed login keeps its account.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL
);

-- One row per signed-in browser. The cookie carries a random id; only its SHA-256 lands here,
-- so a database read can't be replayed as a session. Deleting the row signs that browser out.
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions (expires_at);

-- Which App installations and repos each player can reach, read from GitHub with their own
-- user-to-server token at sign-in (GET /user/installations). A factory is only served to a
-- player with a row here for its repo.
CREATE TABLE IF NOT EXISTS user_installations (
  user_id INTEGER NOT NULL,
  installation_id INTEGER NOT NULL,
  account_login TEXT,
  PRIMARY KEY (user_id, installation_id)
);
CREATE TABLE IF NOT EXISTS user_repos (
  user_id INTEGER NOT NULL,
  repo TEXT NOT NULL,            -- lowercase owner/name
  installation_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, repo)
);
CREATE INDEX IF NOT EXISTS user_repos_repo ON user_repos (repo);

-- Small per-player settings that used to live only in one browser (intro seen, guide progress).
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
