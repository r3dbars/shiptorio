-- One dollar ceiling per paying account per UTC day, across every factory it pays for.
ALTER TABLE spark_factory_calls ADD COLUMN account TEXT;
CREATE INDEX spark_factory_calls_account_day ON spark_factory_calls(account, day);
-- NULL keeps the default ($5); an operator can raise or lower one account without a deploy.
ALTER TABLE admin_user_limits ADD COLUMN spend_nano_usd INTEGER CHECK(spend_nano_usd IS NULL OR spend_nano_usd >= 0);
-- The site-wide ceiling sums every call of the day.
CREATE INDEX spark_factory_calls_day_only ON spark_factory_calls(day);
