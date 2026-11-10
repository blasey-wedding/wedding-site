-- Events and meal options. PLACEHOLDER values: edit and re-run with
--   npm run db:events:local   (or db:events:remote)
-- Safe to re-run: existing rows are updated in place, matched by slug.

INSERT INTO events (slug, name, starts_at, location, asks_meal, sort_order) VALUES
  ('welcome', 'Welcome party', '2027-09-03T19:00:00-04:00', 'Location to come', 0, 1),
  ('wedding', 'The wedding',   '2027-09-04T16:00:00-04:00', '2040 Russell Rd, Baroda, MI 49101', 1, 2)
ON CONFLICT (slug) DO UPDATE SET
  name = excluded.name, starts_at = excluded.starts_at, location = excluded.location,
  asks_meal = excluded.asks_meal, sort_order = excluded.sort_order;

INSERT INTO meal_options (event_id, slug, label, sort_order)
SELECT id, 'chicken', 'Herb-roasted chicken', 1 FROM events WHERE slug = 'wedding'
UNION ALL SELECT id, 'salmon', 'Cedar-plank salmon', 2 FROM events WHERE slug = 'wedding'
UNION ALL SELECT id, 'risotto', 'Wild mushroom risotto (vegetarian)', 3 FROM events WHERE slug = 'wedding'
ON CONFLICT (event_id, slug) DO UPDATE SET label = excluded.label, sort_order = excluded.sort_order, active = 1;
