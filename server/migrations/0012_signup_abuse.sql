-- Separate names from the account/auth and Spark budget ledgers.
CREATE TABLE signup_waitlist (
  identity TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('email','github')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE signup_allowlist (
  login TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1,
  approved_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
  factories INTEGER NOT NULL DEFAULT 3, repos INTEGER NOT NULL DEFAULT 3,
  runs_daily INTEGER NOT NULL DEFAULT 20
);
CREATE TABLE signup_invites (
  digest TEXT PRIMARY KEY, expires_at INTEGER NOT NULL,
  created_by TEXT NOT NULL, redeemed_by TEXT, redeemed_at INTEGER
);
CREATE TABLE signup_counters (
  scope TEXT NOT NULL, bucket INTEGER NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL, PRIMARY KEY(scope,bucket)
);
CREATE INDEX signup_counters_expiry ON signup_counters(expires_at);
CREATE TABLE signup_abuse (
  scope TEXT PRIMARY KEY, reason TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE TABLE signup_resources (
  login TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('factory','repo')),
  resource TEXT NOT NULL, PRIMARY KEY(login,kind,resource)
);
