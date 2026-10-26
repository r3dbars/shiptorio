-- Reservations are atomic across factories and Worker isolates. UTC daily ledger.
CREATE TABLE spark_usage (
  account TEXT NOT NULL, day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, day)
);
CREATE TABLE api_limits (
  scope TEXT PRIMARY KEY, next_at INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0
);
