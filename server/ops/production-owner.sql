-- Only the explicit shiptorio production deploy invokes this operational grant.
-- Portable migrations and self-host setup must never enroll this account.
INSERT INTO signup_allowlist(login, enabled, approved_by, updated_at, factories, repos, runs_daily, spark_calls_daily, spark_tokens_daily)
VALUES ('r3dbars', 1, 'r3dbars', unixepoch() * 1000, 99999, 99999, 200, NULL, NULL)
ON CONFLICT(login) DO UPDATE SET
  enabled=excluded.enabled, updated_at=excluded.updated_at,
  factories=excluded.factories, repos=excluded.repos, runs_daily=excluded.runs_daily,
  spark_calls_daily=excluded.spark_calls_daily, spark_tokens_daily=excluded.spark_tokens_daily;
DELETE FROM signup_abuse WHERE scope='runs:r3dbars';
