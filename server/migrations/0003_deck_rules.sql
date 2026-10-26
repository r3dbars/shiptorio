-- Player dismissals are scoped to one repository and one class of decision.
CREATE TABLE IF NOT EXISTS move_kind_rules (
  repo TEXT NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  action_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (repo, kind, scope)
);
