CREATE TABLE IF NOT EXISTS marketplace_submissions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('plugin', 'vault-template')),
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'quarantined'
    CHECK (status IN ('quarantined', 'approved', 'rejected')),
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  review_notes TEXT NOT NULL DEFAULT '',
  UNIQUE(kind, sha256)
);
CREATE INDEX IF NOT EXISTS marketplace_submissions_status_created_idx
  ON marketplace_submissions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_submission_chunks (
  submission_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  payload BLOB NOT NULL,
  PRIMARY KEY(submission_id, chunk_index),
  FOREIGN KEY(submission_id) REFERENCES marketplace_submissions(id) ON DELETE CASCADE
);
