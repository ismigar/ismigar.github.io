CREATE TABLE IF NOT EXISTS redirect_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL,
  destination TEXT NOT NULL,
  campaign TEXT NOT NULL,
  target_url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS redirect_events_occurred_at_idx ON redirect_events(occurred_at);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  metric TEXT NOT NULL,
  dimension TEXT NOT NULL DEFAULT '',
  captured_at TEXT NOT NULL,
  period_date TEXT NOT NULL,
  value REAL NOT NULL,
  UNIQUE(source, metric, dimension, captured_at, period_date)
);
CREATE INDEX IF NOT EXISTS metric_snapshots_period_idx ON metric_snapshots(period_date, source, metric);

CREATE TABLE IF NOT EXISTS release_asset_snapshots (
  asset_id INTEGER NOT NULL,
  release_tag TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  period_date TEXT NOT NULL,
  download_count INTEGER NOT NULL,
  PRIMARY KEY(asset_id, captured_at)
);
CREATE INDEX IF NOT EXISTS release_assets_period_idx ON release_asset_snapshots(period_date);

CREATE TABLE IF NOT EXISTS sponsor_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  action TEXT NOT NULL,
  sponsor_hash TEXT NOT NULL,
  tier_cents INTEGER NOT NULL DEFAULT 0,
  one_time_cents INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'unknown',
  raw_kind TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sponsor_events_occurred_at_idx ON sponsor_events(occurred_at);

CREATE TABLE IF NOT EXISTS sync_runs (
  source TEXT PRIMARY KEY,
  last_attempt_at TEXT NOT NULL,
  last_success_at TEXT,
  status TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  parser_version TEXT
);
