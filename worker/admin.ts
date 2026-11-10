import type { Env } from './env';
import { HttpError, assertSameOrigin, json, readJson, text } from './http';
import { rsvpStatus } from './rsvp';
import { signHouseholdToken } from './token';
import { reminderEmail, sendEmail } from './email';

export type AdminSummary = {
  admin: string;
  status: string;
  deadline: string;
  households: { total: number; responded: number };
  events: { slug: string; name: string; invited: number; attending: number; declined: number; pending: number }[];
  meals: { event: string; label: string; count: number }[];
  missingMeals: number;
  shuttleSeats: number;
  dietaryNotes: { name: string; notes: string }[];
  songs: { household: string; song: string }[];
  notes: { household: string; note: string }[];
  recent: { household: string; at: string }[];
  emails: { sent: number; logged: number; failed: number };
};

export type AdminHousehold = {
  id: number;
  displayName: string;
  email: string | null;
  lastSubmittedAt: string | null;
  lastReminderAt: string | null;
  guests: { name: string; isPlusOne: boolean; events: Record<string, boolean | null>; meal: string | null; dietaryNotes: string | null }[];
};

const fullName = (f: string | null, l: string | null, plus: number) =>
  [f, l].filter(Boolean).join(' ') || (plus ? '(unnamed plus-one)' : '(no name)');

export async function summary(request: Request, env: Env, admin: string): Promise<Response> {
  const db = env.DB;
  const [hh, events, meals, missing, extras, dietary, songs, notes, recent, emails] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(EXISTS (SELECT 1 FROM submissions s WHERE s.household_id = h.id)) AS responded
       FROM households h`,
    ),
    db.prepare(
      `SELECT e.slug, e.name,
              COUNT(i.guest_id) AS invited,
              COALESCE(SUM(r.attending = 1), 0) AS attending,
              COALESCE(SUM(r.attending = 0), 0) AS declined
       FROM events e
       LEFT JOIN invitations i ON i.event_id = e.id
       LEFT JOIN responses r ON r.guest_id = i.guest_id AND r.event_id = e.id
       GROUP BY e.id ORDER BY e.sort_order, e.id`,
    ),
    db.prepare(
      `SELECT e.name AS event, mo.label, COUNT(mc.guest_id) AS count
       FROM meal_options mo JOIN events e ON e.id = mo.event_id
       LEFT JOIN meal_choices mc ON mc.meal_option_id = mo.id
       GROUP BY mo.id ORDER BY e.sort_order, mo.sort_order, mo.id`,
    ),
    // Attending a meal event but no meal on file (shouldn't happen; the API requires one)
    db.prepare(
      `SELECT COUNT(*) AS n FROM responses r JOIN events e ON e.id = r.event_id
       LEFT JOIN meal_choices mc ON mc.guest_id = r.guest_id
       WHERE e.asks_meal = 1 AND r.attending = 1 AND mc.guest_id IS NULL`,
    ),
    db.prepare('SELECT COALESCE(SUM(shuttle_seats), 0) AS seats FROM households'),
    db.prepare(
      `SELECT g.first_name, g.last_name, g.is_plus_one, mc.dietary_notes FROM meal_choices mc
       JOIN guests g ON g.id = mc.guest_id WHERE mc.dietary_notes IS NOT NULL AND mc.dietary_notes <> ''`,
    ),
    db.prepare("SELECT display_name, song_request FROM households WHERE song_request IS NOT NULL AND song_request <> ''"),
    db.prepare("SELECT display_name, note_to_couple FROM households WHERE note_to_couple IS NOT NULL AND note_to_couple <> ''"),
    db.prepare(
      `SELECT h.display_name, s.submitted_at FROM submissions s JOIN households h ON h.id = s.household_id
       ORDER BY s.id DESC LIMIT 10`,
    ),
    db.prepare(
      `SELECT COALESCE(SUM(status = 'sent'), 0) AS sent, COALESCE(SUM(status = 'logged'), 0) AS logged,
              COALESCE(SUM(status = 'failed'), 0) AS failed FROM emails`,
    ),
  ]);

  type N = Record<string, number>;
  const hhRow = (hh.results[0] ?? {}) as N;
  const body: AdminSummary = {
    admin,
    status: rsvpStatus(env, new URL(request.url)),
    deadline: env.RSVP_DEADLINE,
    households: { total: hhRow.total ?? 0, responded: hhRow.responded ?? 0 },
    events: (events.results as (N & { slug: string; name: string })[]).map((e) => ({
      slug: e.slug,
      name: e.name,
      invited: e.invited,
      attending: e.attending,
      declined: e.declined,
      pending: e.invited - e.attending - e.declined,
    })),
    meals: meals.results as AdminSummary['meals'],
    missingMeals: ((missing.results[0] ?? {}) as N).n ?? 0,
    shuttleSeats: ((extras.results[0] ?? {}) as N).seats ?? 0,
    dietaryNotes: (dietary.results as { first_name: string | null; last_name: string | null; is_plus_one: number; dietary_notes: string }[]).map(
      (r) => ({ name: fullName(r.first_name, r.last_name, r.is_plus_one), notes: r.dietary_notes }),
    ),
    songs: (songs.results as { display_name: string; song_request: string }[]).map((r) => ({ household: r.display_name, song: r.song_request })),
    notes: (notes.results as { display_name: string; note_to_couple: string }[]).map((r) => ({ household: r.display_name, note: r.note_to_couple })),
    recent: (recent.results as { display_name: string; submitted_at: string }[]).map((r) => ({ household: r.display_name, at: r.submitted_at })),
    emails: (emails.results[0] ?? { sent: 0, logged: 0, failed: 0 }) as AdminSummary['emails'],
  };
  return json(body);
}

async function allHouseholds(env: Env): Promise<{ list: AdminHousehold[]; eventSlugs: { slug: string; name: string }[] }> {
  const db = env.DB;
  const [hh, guests, answers, meals, events] = await db.batch([
    db.prepare(
      `SELECT h.id, h.display_name, h.email,
              (SELECT MAX(submitted_at) FROM submissions s WHERE s.household_id = h.id) AS last_submitted_at,
              (SELECT MAX(created_at) FROM emails m WHERE m.household_id = h.id AND m.kind = 'reminder') AS last_reminder_at
       FROM households h ORDER BY h.display_name`,
    ),
    db.prepare('SELECT id, household_id, first_name, last_name, is_plus_one FROM guests ORDER BY household_id, sort_order, id'),
    db.prepare(
      `SELECT i.guest_id, e.slug, r.attending FROM invitations i JOIN events e ON e.id = i.event_id
       LEFT JOIN responses r ON r.guest_id = i.guest_id AND r.event_id = i.event_id`,
    ),
    db.prepare('SELECT mc.guest_id, mo.label, mc.dietary_notes FROM meal_choices mc JOIN meal_options mo ON mo.id = mc.meal_option_id'),
    db.prepare('SELECT slug, name FROM events ORDER BY sort_order, id'),
  ]);

  type G = { id: number; household_id: number; first_name: string | null; last_name: string | null; is_plus_one: number };
  const answersByGuest = new Map<number, Record<string, boolean | null>>();
  for (const a of answers.results as { guest_id: number; slug: string; attending: number | null }[]) {
    const m = answersByGuest.get(a.guest_id) ?? {};
    m[a.slug] = a.attending === null ? null : a.attending === 1;
    answersByGuest.set(a.guest_id, m);
  }
  const mealByGuest = new Map((meals.results as { guest_id: number; label: string; dietary_notes: string | null }[]).map((m) => [m.guest_id, m]));
  const guestsByHousehold = new Map<number, AdminHousehold['guests']>();
  for (const g of guests.results as G[]) {
    const list = guestsByHousehold.get(g.household_id) ?? [];
    list.push({
      name: fullName(g.first_name, g.last_name, g.is_plus_one),
      isPlusOne: g.is_plus_one === 1,
      events: answersByGuest.get(g.id) ?? {},
      meal: mealByGuest.get(g.id)?.label ?? null,
      dietaryNotes: mealByGuest.get(g.id)?.dietary_notes ?? null,
    });
    guestsByHousehold.set(g.household_id, list);
  }

  const list = (hh.results as { id: number; display_name: string; email: string | null; last_submitted_at: string | null; last_reminder_at: string | null }[]).map(
    (h) => ({
      id: h.id,
      displayName: h.display_name,
      email: h.email,
      lastSubmittedAt: h.last_submitted_at,
      lastReminderAt: h.last_reminder_at,
      guests: guestsByHousehold.get(h.id) ?? [],
    }),
  );
  return { list, eventSlugs: events.results as { slug: string; name: string }[] };
}

export async function households(env: Env): Promise<Response> {
  const { list, eventSlugs } = await allHouseholds(env);
  return json({ events: eventSlugs, households: list });
}

/** Guards against spreadsheet formula injection (a guest typing "=HYPERLINK(...)" in a note). */
function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportCsv(env: Env): Promise<Response> {
  const { list, eventSlugs } = await allHouseholds(env);
  const header = ['Household', 'Guest', 'Plus-one', ...eventSlugs.map((e) => e.name), 'Meal', 'Dietary notes', 'Email', 'Last reply (UTC)'];
  const rows = [header];
  for (const h of list) {
    for (const g of h.guests) {
      rows.push([
        h.displayName,
        g.name,
        g.isPlusOne ? 'yes' : '',
        ...eventSlugs.map((e) => (e.slug in g.events ? (g.events[e.slug] === null ? 'no reply' : g.events[e.slug] ? 'yes' : 'no') : 'not invited')),
        g.meal ?? '',
        g.dietaryNotes ?? '',
        h.email ?? '',
        h.lastSubmittedAt ?? '',
      ]);
    }
  }
  const body = '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  const date = new Date().toISOString().slice(0, 10);
  return text(body, 'text/csv; charset=utf-8', { 'content-disposition': `attachment; filename="rsvps-${date}.csv"` });
}

/**
 * Emails households that haven't replied and weren't reminded in the last 3 days.
 * dryRun returns who would be emailed. The limit keeps within Resend's free 100/day.
 */
export async function remind(request: Request, env: Env): Promise<Response> {
  assertSameOrigin(request);
  const body = (await readJson(request)) as { dryRun?: unknown; limit?: unknown };
  const dryRun = body.dryRun !== false;
  const limit = Math.min(Math.max(Number(body.limit) || 90, 1), 90);
  if (!env.TOKEN_SECRET) throw new HttpError(503, 'TOKEN_SECRET isn’t set');

  const { results } = await env.DB.prepare(
    `SELECT h.id, h.display_name, h.email FROM households h
     WHERE h.email IS NOT NULL AND h.email <> ''
       AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.household_id = h.id)
       AND NOT EXISTS (SELECT 1 FROM emails m WHERE m.household_id = h.id AND m.kind = 'reminder'
                       AND m.status IN ('sent', 'logged') AND m.created_at > datetime('now', '-3 days'))
     ORDER BY h.id LIMIT ?1`,
  )
    .bind(limit)
    .all<{ id: number; display_name: string; email: string }>();

  if (dryRun) return json({ dryRun: true, count: results.length, households: results.map((r) => r.display_name) });

  const origin = new URL(request.url).origin;
  const expires = new Date(new Date(env.RSVP_DEADLINE).getTime() + 7 * 24 * 3600 * 1000);
  const outcome = { sent: 0, logged: 0, failed: 0 };
  const day = new Date().toISOString().slice(0, 10);
  for (const r of results) {
    const token = await signHouseholdToken(env.TOKEN_SECRET, r.id, expires);
    const msg = reminderEmail(r.display_name, `${origin}/rsvp#t=${token}`, env.RSVP_DEADLINE);
    outcome[await sendEmail(env, r.id, 'reminder', { to: r.email, ...msg }, `reminder-${r.id}-${day}`)]++;
  }
  return json({ dryRun: false, ...outcome });
}
