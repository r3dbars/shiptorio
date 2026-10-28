-- Reverse installation lookup is used when installations are revoked/deleted.
CREATE INDEX IF NOT EXISTS user_installations_installation ON user_installations(installation_id);
-- The primary key starts with login; factory owner attribution searches in the other direction.
-- Keep rowid as the tie breaker: callers deliberately take the first recorded owner.
CREATE INDEX IF NOT EXISTS signup_resources_lookup ON signup_resources(kind, resource);
