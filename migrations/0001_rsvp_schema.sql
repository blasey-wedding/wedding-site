-- DRAFT RSVP schema for Cloudflare D1 (SQLite).
-- Not applied yet: finalize after the open decisions in LAUNCH-CHECKLIST.md section 5.
-- Apply later with: npx wrangler d1 migrations apply <db-name>

-- One row per invitation envelope.
CREATE TABLE households (
  id               INTEGER PRIMARY KEY,
  display_name     TEXT    NOT NULL,                 -- "The Smith Family"
  email            TEXT,                             -- where confirmations go
  plus_one_allowed INTEGER NOT NULL DEFAULT 0 CHECK (plus_one_allowed IN (0, 1)),
  -- Optional extras (drop any you decide not to ask):
  shuttle_seats    INTEGER CHECK (shuttle_seats >= 0),
  hotel            TEXT,
  song_request     TEXT,
  note_to_couple   TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- One row per person. A plus-one is a placeholder row (no name) until the household names them.
CREATE TABLE guests (
  id           INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  first_name   TEXT,
  last_name    TEXT,
  is_plus_one  INTEGER NOT NULL DEFAULT 0 CHECK (is_plus_one IN (0, 1)),
  CHECK (is_plus_one = 1 OR (first_name IS NOT NULL AND last_name IS NOT NULL))
);
CREATE INDEX guests_household ON guests(household_id);

-- Every name a guest might type: legal name plus nicknames ("bob smith" -> Robert Smith).
-- Stored normalized (lowercase, accents and punctuation removed) by the import script.
CREATE TABLE guest_search_names (
  guest_id        INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  name_normalized TEXT    NOT NULL,
  PRIMARY KEY (guest_id, name_normalized)
);
CREATE INDEX search_by_name ON guest_search_names(name_normalized);

CREATE TABLE events (
  id         INTEGER PRIMARY KEY,
  slug       TEXT    NOT NULL UNIQUE,               -- 'welcome', 'wedding'
  name       TEXT    NOT NULL,
  starts_at  TEXT    NOT NULL,                      -- ISO 8601 with offset
  location   TEXT,
  asks_meal  INTEGER NOT NULL DEFAULT 0 CHECK (asks_meal IN (0, 1))
);

-- Who is invited to what. Handles "welcome party for some guests only".
CREATE TABLE invitations (
  guest_id INTEGER NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (guest_id, event_id)
);

-- Current answer per guest per event. The foreign key means you can only answer for events you're invited to.
CREATE TABLE responses (
  guest_id   INTEGER NOT NULL,
  event_id   INTEGER NOT NULL,
  attending  INTEGER NOT NULL CHECK (attending IN (0, 1)),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guest_id, event_id),
  FOREIGN KEY (guest_id, event_id) REFERENCES invitations(guest_id, event_id) ON DELETE CASCADE
);

-- Options come from the caterer; a table instead of a CHECK so they can change without a migration.
CREATE TABLE meal_options (
  id       INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  slug     TEXT    NOT NULL,
  label    TEXT    NOT NULL,                        -- "Herb-roasted chicken"
  active   INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (event_id, slug)
);

-- One meal per guest. The Worker only accepts this for guests attending an event with asks_meal = 1.
CREATE TABLE meal_choices (
  guest_id       INTEGER PRIMARY KEY REFERENCES guests(id) ON DELETE CASCADE,
  meal_option_id INTEGER NOT NULL REFERENCES meal_options(id),
  dietary_notes  TEXT
);

-- Append-only record of every submission, exactly as received. Never updated or deleted.
CREATE TABLE submissions (
  id           INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  submitted_at TEXT    NOT NULL DEFAULT (datetime('now')),
  payload_json TEXT    NOT NULL CHECK (json_valid(payload_json))
);
CREATE INDEX submissions_by_household ON submissions(household_id, submitted_at);
