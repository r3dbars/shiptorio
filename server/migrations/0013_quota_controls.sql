-- NULL inherits the Worker default; zero deliberately pauses paid thinking.
ALTER TABLE signup_allowlist ADD COLUMN spark_calls_daily INTEGER CHECK(spark_calls_daily >= 0);
ALTER TABLE signup_allowlist ADD COLUMN spark_tokens_daily INTEGER CHECK(spark_tokens_daily >= 0);
