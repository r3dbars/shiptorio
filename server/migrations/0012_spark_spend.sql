-- Integer nano-USD avoids rounding each token. Reservations count conservatively until settled.
CREATE TABLE spark_factory_budgets (
  repo TEXT PRIMARY KEY, daily_nano_usd INTEGER NOT NULL CHECK(daily_nano_usd >= 0)
);
CREATE TABLE spark_factory_calls (
  id TEXT PRIMARY KEY, repo TEXT NOT NULL, day TEXT NOT NULL, model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  nano_usd INTEGER NOT NULL CHECK(nano_usd >= 0), settled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX spark_factory_calls_day ON spark_factory_calls(repo, day);
CREATE VIEW spark_factory_daily AS
SELECT repo, day, COUNT(*) AS calls, SUM(input_tokens) AS input_tokens,
  SUM(output_tokens) AS output_tokens, SUM(cached_tokens) AS cached_tokens,
  SUM(nano_usd) AS nano_usd, SUM(1 - settled) AS unmeasured_calls
FROM spark_factory_calls GROUP BY repo, day;
