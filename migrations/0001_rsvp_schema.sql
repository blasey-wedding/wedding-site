-- RSVP schema for Cloudflare D1 (SQLite).
-- Apply with: npm run db:migrate:local   (or db:migrate:remote)
-- Never edit this file after it has been applied remotely; add 0002_... instead.

-- One row per invitation envelope.
CREATE TABLE households (
  id               INTEGER PRIMARY KEY,
  display_name     TEXT    NOT NULL,                  -- "The Rivera Family"
  email            TEXT,                              -- where confirmations go
  plus_one_allowed INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_allowed IN (0, 1)),
  shuttle_seats    INTEGER CHECK (shuttle_seats BETWEEN 0 AND 20),
  song_request     TEXT    CHECK (length(song_request) <= 200),
  note_to_couple   TEXT    CHECK (length(note_to_couple) <= 1000),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One row per person. A plus-one is a placeholder row (no name) until the household names them.
CREATE TABLE guests (
  id           INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  first_name   TEXT,
  last_name    TEXT,
  is_plus_one  INTEGER NOT NULL DEFAULT 0 CHECK (is_plus_one IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  CHECK (is_plus_one = 1 OR (first_name IS NOT NULL AND last_name IS NOT NULL))
);
CREATE INDEX guests_household ON guests(household_id);

-- Every full name a guest might type, normalized by shared/rsvp.ts normalizeName().
CREATE TABLE guest_search_names (
  guest_id        INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  name_normalized TEXT    NOT NULL,
  PRIMARY KEY (guest_id, name_normalized)
);
CREATE INDEX search_by_name ON guest_search_names(name_normalized);

CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,                 -- 'welcome', 'wedding'
  name       TEXT    NOT NULL,
  starts_at  TEXT    NOT NULL,                        -- ISO 8601 with offset
  location   TEXT,
  asks_meal  INTEGER NOT NULL DEFAULT 0 CHECK (asks_meal IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Who is invited to what. Handles "welcome party for some guests only".
CREATE TABLE invitations (
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (guest_id, event_id)
);

-- Current answer per guest per event. You can only answer for events you're invited to.
CREATE TABLE responses (
  guest_id   INTEGER NOT NULL,
  event_id   INTEGER NOT NULL,
  attending  INTEGER NOT NULL CHECK (attending IN (0, 1)),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guest_id, event_id),
  FOREIGN KEY (guest_id, event_id) REFERENCES invitations(guest_id, event_id) ON DELETE CASCADE
);

-- Options come from the caterer; a table so they can change without a migration.
CREATE TABLE meal_options (
  id       INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  slug     TEXT    NOT NULL,
  label    TEXT    NOT NULL,
  active   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (event_id, slug)
);

-- One meal per guest. The Worker only stores this for guests attending an event with asks_meal = 1.
CREATE TABLE meal_choices (
  guest_id       INTEGER PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  meal_option_id INTEGER NOT NULL REFERENCES meal_options(id),
  dietary_notes  TEXT    CHECK (length(dietary_notes) <= 300)
);

-- Append-only record of every submission, exactly as received. Never updated or deleted.
CREATE TABLE submissions (
  id           INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  submitted_at TEXT    NOT NULL DEFAULT (datetime('now')),
  source       TEXT    NOT NULL DEFAULT 'guest' CHECK (source IN ('guest', 'admin')),
  payload_json TEXT    NOT NULL CHECK (json_valid(payload_json))
);
CREATE INDEX submissions_by_household ON submissions(household_id, submitted_at);

CREATE TRIGGER submissions_no_update BEFORE UPDATE ON submissions
BEGIN SELECT RAISE(ABORT, 'submissions are append-only'); END;
CREATE TRIGGER submissions_no_delete BEFORE DELETE ON submissions
BEGIN SELECT RAISE(ABORT, 'submissions are append-only'); END;

-- Every email the site sends (or logs, before Resend is set up).
CREATE TABLE emails (
  id           INTEGER PRIMARY KEY,
  household_id INTEGER REFERENCES households(id),
  kind         TEXT    NOT NULL CHECK (kind IN ('confirmation', 'reminder')),
  to_address   TEXT    NOT NULL,
  status       TEXT    NOT NULL CHECK (status IN ('sent', 'logged', 'failed')),
  provider_id  TEXT,
  error        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX emails_by_household ON emails(household_id, created_at);

-- Fixed-window counters for rate limiting (key = "lookup:<ip>", window = unix minute bucket).
CREATE TABLE rate_limits (
  key          TEXT    NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
