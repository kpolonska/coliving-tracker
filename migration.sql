-- ============================================================
-- Coliving Tracker — full schema (run on a fresh Supabase project)
-- ============================================================

-- 1. colivings first (everything else depends on it)
CREATE TABLE colivings (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  telegram_bot_token TEXT,
  telegram_chat_id   TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- 2. people (depends on colivings)
CREATE TABLE people (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  coliving_id INT REFERENCES colivings(id) ON DELETE CASCADE
);

-- 3. trash (depends on people)
CREATE TABLE trash_queue (
  id        SERIAL PRIMARY KEY,
  person_id INT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  position  INT NOT NULL DEFAULT 0
);

CREATE TABLE trash_completions (
  id             SERIAL PRIMARY KEY,
  completed_date DATE NOT NULL UNIQUE,
  completed_by   INT REFERENCES people(id) ON DELETE SET NULL
);

-- 4. birthdays (depends on people)
CREATE TABLE birthdays (
  id         SERIAL PRIMARY KEY,
  person_id  INT NOT NULL REFERENCES people(id) ON DELETE CASCADE UNIQUE,
  birth_date DATE NOT NULL
);

-- 5. cleaning (depends on colivings + people)
CREATE TABLE cleaning_groups (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  coliving_id INT REFERENCES colivings(id) ON DELETE CASCADE
);

CREATE TABLE cleaning_group_members (
  id        SERIAL PRIMARY KEY,
  group_id  INT NOT NULL REFERENCES cleaning_groups(id) ON DELETE CASCADE,
  person_id INT NOT NULL REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE cleaning_settings (
  id             SERIAL PRIMARY KEY,
  start_date     DATE,
  start_group_id INT REFERENCES cleaning_groups(id) ON DELETE SET NULL,
  coliving_id    INT REFERENCES colivings(id) ON DELETE CASCADE,
  CONSTRAINT cleaning_settings_coliving_id_unique UNIQUE (coliving_id)
);

CREATE TABLE cleaning_postponements (
  id            SERIAL PRIMARY KEY,
  group_id      INT NOT NULL REFERENCES cleaning_groups(id) ON DELETE CASCADE,
  group_name    TEXT,
  original_date DATE NOT NULL,
  new_date      DATE NOT NULL
);

-- 6. vitalnya (depends on colivings)
CREATE TABLE vitalnya_bookings (
  id           SERIAL PRIMARY KEY,
  booking_date DATE NOT NULL,
  time_start   TEXT NOT NULL,
  time_end     TEXT NOT NULL,
  name         TEXT NOT NULL,
  strict       BOOLEAN DEFAULT FALSE,
  coliving_id  INT REFERENCES colivings(id) ON DELETE CASCADE
);

-- 7. auth tables (depend on colivings + people)
CREATE TABLE coliving_members (
  id               SERIAL PRIMARY KEY,
  coliving_id      INT  NOT NULL REFERENCES colivings(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'member',
  linked_person_id INT  REFERENCES people(id) ON DELETE SET NULL,
  joined_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coliving_id, user_id)
);

CREATE TABLE invitations (
  id             SERIAL PRIMARY KEY,
  coliving_id    INT  NOT NULL REFERENCES colivings(id) ON DELETE CASCADE,
  invited_email  TEXT NOT NULL,
  invited_by     UUID REFERENCES auth.users(id),
  accepted       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at     TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE TABLE invite_codes (
  id          SERIAL PRIMARY KEY,
  coliving_id INT  NOT NULL REFERENCES colivings(id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES auth.users(id),
  expires_at  TIMESTAMPTZ NOT NULL
);
