-- Additive migration for the existing prayerjournal-db. Existing tables are untouched.
CREATE TABLE IF NOT EXISTS prayer_journeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prayer_journeys_owner_updated
  ON prayer_journeys(user_id, updated_at DESC);
