-- Reservations are atomic across factories and Worker isolates. UTC daily ledger.
CREATE TABLE spark_usage (
  account TEXT NOT NULL, day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, day)
);
CREATE TABLE api_limits (
  scope TEXT PRIMARY KEY, next_at INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0
);

-- The first signed-in player to connect a repo pays its autonomous Spark usage.
-- Other collaborators and reconnects cannot transfer that bill or reset its daily cap.
CREATE TABLE factory_budget_owners (
  repo TEXT PRIMARY KEY, user_id INTEGER NOT NULL
);
