-- docs/context/taps.md: one row per card offered to the player and what they did with it.
-- No player login is stored; the factory's repo is the only identity. Rows older than 90 days are purged.
CREATE TABLE card_taps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repo TEXT NOT NULL,
  card_id TEXT NOT NULL,
  item_id TEXT,
  kind TEXT NOT NULL,          -- MoveKind: unblock, build, verify, input, automate, ship, review, reply
  scope TEXT NOT NULL,         -- moveScope(): district:web, source:sentry, tool:..., stage:...
  play TEXT,                   -- bottleneck-brain unlock play id, when the card came from the brain
  attention TEXT,              -- approve, steer, suggest
  title TEXT NOT NULL,         -- redacted, 120 chars
  suggested TEXT,              -- the recommended option id when the card was offered
  because TEXT,                -- the planner's one-line reason on the card (redacted)
  by TEXT NOT NULL,            -- spark (the model picked or explained it) or rule
  context TEXT,                -- JSON: bottleneck + signals the factory saw at the time
  shown_at INTEGER NOT NULL,
  decided_at INTEGER,
  action TEXT,                 -- continue, other, later, never, gone (left the deck untapped)
  option_id TEXT,
  reason TEXT,                 -- never reason chip: once, kind, spark, wrong
  outcome TEXT,                -- shipped_clean, shipped_after_rework, rework, came_back
  outcome_at INTEGER
);
CREATE INDEX card_taps_open ON card_taps (repo, card_id, decided_at);
CREATE INDEX card_taps_item ON card_taps (repo, item_id);
CREATE INDEX card_taps_shown ON card_taps (shown_at);
