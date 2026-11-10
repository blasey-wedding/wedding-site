import type { HouseholdEvent, HouseholdGuest, HouseholdResponse } from '../shared/rsvp';

type HouseholdRow = {
  id: number;
  display_name: string;
  email: string | null;
  plus_one_allowed: number;
  shuttle_seats: number | null;
  song_request: string | null;
  note_to_couple: string | null;
  responded: number;
};
type GuestRow = { id: number; first_name: string | null; last_name: string | null; is_plus_one: number };
type EventRow = { id: number; slug: string; name: string; starts_at: string; location: string | null; asks_meal: number };
type MealOptionRow = { id: number; event_id: number; slug: string; label: string };
type AnswerRow = { guest_id: number; slug: string; attending: number | null };
type MealRow = { guest_id: number; slug: string; dietary_notes: string | null };

export type LoadedHousehold = Omit<HouseholdResponse, 'deadline' | 'canEdit'> & {
  id: number;
  /** Internal ids the submit handler needs to write rows. */
  eventIds: Record<string, number>;
  mealOptionIds: Record<string, Record<string, number>>; // event slug -> meal slug -> id
};

export async function loadHousehold(db: D1Database, householdId: number): Promise<LoadedHousehold | null> {
  const [h, guests, events, options, answers, meals] = await db.batch([
    db
      .prepare(
        `SELECT h.*, EXISTS (SELECT 1 FROM submissions s WHERE s.household_id = h.id) AS responded
         FROM households h WHERE h.id = ?1`,
      )
      .bind(householdId),
    db
      .prepare('SELECT id, first_name, last_name, is_plus_one FROM guests WHERE household_id = ?1 ORDER BY sort_order, id')
      .bind(householdId),
    db
      .prepare(
        `SELECT DISTINCT e.id, e.slug, e.name, e.starts_at, e.location, e.asks_meal, e.sort_order
         FROM events e
         JOIN invitations i ON i.event_id = e.id
         JOIN guests g ON g.id = i.guest_id
         WHERE g.household_id = ?1
         ORDER BY e.sort_order, e.id`,
      )
      .bind(householdId),
    db.prepare('SELECT id, event_id, slug, label FROM meal_options WHERE active = 1 ORDER BY sort_order, id'),
    db
      .prepare(
        `SELECT i.guest_id, e.slug, r.attending
         FROM invitations i
         JOIN events e ON e.id = i.event_id
         JOIN guests g ON g.id = i.guest_id
         LEFT JOIN responses r ON r.guest_id = i.guest_id AND r.event_id = i.event_id
         WHERE g.household_id = ?1`,
      )
      .bind(householdId),
    db
      .prepare(
        `SELECT mc.guest_id, mo.slug, mc.dietary_notes
         FROM meal_choices mc
         JOIN meal_options mo ON mo.id = mc.meal_option_id
         JOIN guests g ON g.id = mc.guest_id
         WHERE g.household_id = ?1`,
      )
      .bind(householdId),
  ]);

  const household = (h.results as HouseholdRow[])[0];
  if (!household) return null;

  const eventRows = events.results as EventRow[];
  const optionRows = options.results as MealOptionRow[];
  const eventIds: Record<string, number> = {};
  const mealOptionIds: Record<string, Record<string, number>> = {};

  const outEvents: HouseholdEvent[] = eventRows.map((e) => {
    eventIds[e.slug] = e.id;
    const opts = optionRows.filter((o) => o.event_id === e.id);
    mealOptionIds[e.slug] = Object.fromEntries(opts.map((o) => [o.slug, o.id]));
    return {
      slug: e.slug,
      name: e.name,
      startsAt: e.starts_at,
      location: e.location,
      asksMeal: e.asks_meal === 1,
      mealOptions: e.asks_meal === 1 ? opts.map((o) => ({ slug: o.slug, label: o.label })) : [],
    };
  });

  const answerRows = answers.results as AnswerRow[];
  const mealRows = meals.results as MealRow[];

  const outGuests: HouseholdGuest[] = (guests.results as GuestRow[]).map((g) => {
    const mine = answerRows.filter((a) => a.guest_id === g.id);
    const meal = mealRows.find((m) => m.guest_id === g.id);
    return {
      id: g.id,
      firstName: g.first_name,
      lastName: g.last_name,
      isPlusOne: g.is_plus_one === 1,
      events: Object.fromEntries(mine.map((a) => [a.slug, a.attending === null ? null : a.attending === 1])),
      meal: meal?.slug ?? null,
      dietaryNotes: meal?.dietary_notes ?? null,
    };
  });

  return {
    id: household.id,
    displayName: household.display_name,
    email: household.email,
    shuttleSeats: household.shuttle_seats,
    songRequest: household.song_request,
    noteToCouple: household.note_to_couple,
    hasResponded: household.responded === 1,
    events: outEvents,
    guests: outGuests,
    eventIds,
    mealOptionIds,
  };
}

/** Strips internal ids before sending to the browser. */
export function publicHousehold(h: LoadedHousehold, deadline: string, canEdit: boolean): HouseholdResponse {
  const { id: _id, eventIds: _e, mealOptionIds: _m, ...rest } = h;
  return { ...rest, deadline, canEdit };
}
