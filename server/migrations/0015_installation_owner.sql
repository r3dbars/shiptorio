-- Never infer historical ownership from a reusable GitHub login.
ALTER TABLE installations ADD COLUMN account_id INTEGER;
