-- Prod migration: apply before merging dev into main
-- Both changes are additive; safe to run while old code is live.

-- 1. invite_codes table (new feature: join-by-code)
CREATE TABLE IF NOT EXISTS invite_codes (
  id          SERIAL PRIMARY KEY,
  coliving_id INT  NOT NULL REFERENCES colivings(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES auth.users(id),
  expires_at  TIMESTAMPTZ NOT NULL
);

-- 2. configurable cleaning interval (new feature)
ALTER TABLE cleaning_settings
  ADD COLUMN IF NOT EXISTS interval_days INT NOT NULL DEFAULT 7;
