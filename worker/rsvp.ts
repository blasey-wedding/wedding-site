import type { Env } from './env';
import {
  fieldErrors,
  lookupRequest,
  normalizeName,
  submitRequest,
  type ConfigResponse,
  type LookupResponse,
  type RsvpStatus,
} from '../shared/rsvp';
import { HttpError, assertSameOrigin, clientIp, json, readJson } from './http';
import { loadHousehold, publicHousehold, type LoadedHousehold } from './household';
import { pruneRateLimits, rateLimit } from './ratelimit';
import { signHouseholdToken, verifyHouseholdToken } from './token';
import { verifyTurnstile } from './turnstile';
import { confirmationEmail, sendEmail } from './email';

/** Anything that isn't a production hostname (previews, localhost) is test mode: always open. */
export function isTestMode(env: Env, url: URL): boolean {
  const prod = env.PRODUCTION_HOSTS.split(',').map((s) => s.trim().toLowerCase());
  return !prod.includes(url.hostname.toLowerCase());
}

export function rsvpStatus(env: Env, url: URL, now = new Date()): RsvpStatus {
  if (isTestMode(env, url)) return 'open';
  if (now < new Date(env.RSVP_OPENS)) return 'not-open';
  if (now > new Date(env.RSVP_DEADLINE)) return 'closed';
  return 'open';
}

function tokenExpiry(env: Env): Date {
  // Links keep working a week past the deadline so guests can still view (not edit) their reply.
  const d = new Date(env.RSVP_DEADLINE);
  const floor = Date.now() + 7 * 24 * 3600 * 1000;
  return new Date(Math.max(d.getTime() + 7 * 24 * 3600 * 1000, floor));
}

function requireSecrets(env: Env): { tokenSecret: string; turnstileSecret: string } {
  if (!env.TOKEN_SECRET || !env.TURNSTILE_SECRET) throw new HttpError(503, 'RSVP isn’t configured yet');
  return { tokenSecret: env.TOKEN_SECRET, turnstileSecret: env.TURNSTILE_SECRET };
}

export function getConfig(env: Env, url: URL): Response {
  const body: ConfigResponse = {
    status: rsvpStatus(env, url),
    testMode: isTestMode(env, url),
    opensAt: env.RSVP_OPENS,
    deadline: env.RSVP_DEADLINE,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
  };
  return json(body);
}

export async function lookup(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  assertSameOrigin(request);
  const url = new URL(request.url);
  if (rsvpStatus(env, url) !== 'open') throw new HttpError(403, 'RSVPs aren’t open right now');
  const { tokenSecret, turnstileSecret } = requireSecrets(env);

  const ip = clientIp(request);
  ctx.waitUntil(pruneRateLimits(env.DB));
  if (!(await rateLimit(env.DB, `lookup:${ip}`, 10, 600))) {
    throw new HttpError(429, 'Too many tries. Please wait a few minutes and try again.');
  }

  const parsed = lookupRequest.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Please check the highlighted fields', fieldErrors(parsed.error));
  const { firstName, lastName, turnstileToken } = parsed.data;

  if (!(await verifyTurnstile(turnstileSecret, turnstileToken, ip))) {
    throw new HttpError(400, 'We couldn’t confirm you’re human. Please try the check again.');
  }

  const searched = normalizeName(`${firstName} ${lastName}`);
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT g.household_id AS id FROM guest_search_names s
     JOIN guests g ON g.id = s.guest_id WHERE s.name_normalized = ?1 LIMIT 5`,
  )
    .bind(searched)
    .all<{ id: number }>();

  if (results.length === 0) {
    throw new HttpError(
      404,
      'We couldn’t find that name. Try it exactly as it appears on your invitation, or email us and we’ll sort it out.',
    );
  }

  // Usually one household. With two "Alex Kim"s, the guest picks by the first names in each party.
  const matches = await Promise.all(
    results.map(async ({ id }) => {
      const { results: names } = await env.DB.prepare(
        'SELECT first_name FROM guests WHERE household_id = ?1 AND is_plus_one = 0 ORDER BY sort_order, id',
      )
        .bind(id)
        .all<{ first_name: string }>();
      const firsts = names.map((n) => n.first_name);
      const label = firsts.length > 1 ? `${firsts.slice(0, -1).join(', ')} & ${firsts.at(-1)}` : (firsts[0] ?? 'Your party');
      return { token: await signHouseholdToken(tokenSecret, id, tokenExpiry(env)), label };
    }),
  );
  const body: LookupResponse = { matches };
  return json(body);
}

async function householdFromAuth(request: Request, env: Env): Promise<LoadedHousehold> {
  const { tokenSecret } = requireSecrets(env);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const id = token ? await verifyHouseholdToken(tokenSecret, token) : null;
  if (!id) throw new HttpError(401, 'This link has expired. Please look up your name again.');
  const h = await loadHousehold(env.DB, id);
  if (!h) throw new HttpError(401, 'We couldn’t find your invitation. Please look up your name again.');
  return h;
}

export async function getHousehold(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const h = await householdFromAuth(request, env);
  return json(publicHousehold(h, env.RSVP_DEADLINE, rsvpStatus(env, url) === 'open'));
}

export async function submit(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  assertSameOrigin(request);
  const url = new URL(request.url);
  if (rsvpStatus(env, url) !== 'open') throw new HttpError(403, 'RSVPs are closed. Email us if something has changed.');
  const h = await householdFromAuth(request, env);

  if (!(await rateLimit(env.DB, `submit:${h.id}`, 10, 600))) {
    throw new HttpError(429, 'That’s a lot of updates! Please wait a few minutes and try again.');
  }

  const raw = await readJson(request);
  const parsed = submitRequest.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'Please check the highlighted fields', fieldErrors(parsed.error));
  const data = parsed.data;

  /* ---- Check the answers against what this household was actually invited to ---- */
  const fields: Record<string, string> = {};
  const byId = new Map(data.guests.map((g, i) => [g.guestId, { answer: g, index: i }]));
  if (byId.size !== data.guests.length) throw new HttpError(400, 'Each guest can only be answered once');
  for (const g of h.guests) if (!byId.has(g.id)) throw new HttpError(400, 'Please answer for everyone in your party');
  for (const id of byId.keys()) if (!h.guests.some((g) => g.id === id)) throw new HttpError(400, 'Unknown guest');

  const mealEvent = h.events.find((e) => e.asksMeal);

  for (const g of h.guests) {
    const { answer, index } = byId.get(g.id)!;
    const invited = Object.keys(g.events);
    const given = Object.keys(answer.events);
    if (given.length !== invited.length || !invited.every((slug) => slug in answer.events)) {
      throw new HttpError(400, 'Please answer every event for every guest');
    }
    const anyYes = invited.some((slug) => answer.events[slug]);
    if (g.isPlusOne && anyYes) {
      if (!answer.firstName) fields[`guests.${index}.firstName`] = 'Please add your guest’s first name';
      if (!answer.lastName) fields[`guests.${index}.lastName`] = 'Please add your guest’s last name';
    }
    if (mealEvent && answer.events[mealEvent.slug]) {
      if (!answer.meal) fields[`guests.${index}.meal`] = 'Please choose a meal';
      else if (!(answer.meal in h.mealOptionIds[mealEvent.slug])) fields[`guests.${index}.meal`] = 'Please choose one of the listed meals';
    }
  }
  if (Object.keys(fields).length) throw new HttpError(400, 'Please check the highlighted fields', fields);

  /* ---- Write everything in one atomic batch ---- */
  const db = env.DB;
  const stmts: D1PreparedStatement[] = [
    db
      .prepare('UPDATE households SET email = ?2, shuttle_seats = ?3, song_request = ?4, note_to_couple = ?5 WHERE id = ?1')
      .bind(h.id, data.email, data.shuttleSeats ?? null, data.songRequest || null, data.noteToCouple || null),
  ];

  for (const g of h.guests) {
    const { answer } = byId.get(g.id)!;
    if (g.isPlusOne) {
      stmts.push(
        db.prepare('UPDATE guests SET first_name = ?2, last_name = ?3 WHERE id = ?1').bind(g.id, answer.firstName || null, answer.lastName || null),
      );
    }
    for (const [slug, attending] of Object.entries(answer.events)) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO responses (guest_id, event_id, attending) VALUES (?1, ?2, ?3)
             ON CONFLICT (guest_id, event_id) DO UPDATE SET attending = excluded.attending, updated_at = datetime('now')`,
          )
          .bind(g.id, h.eventIds[slug], attending ? 1 : 0),
      );
    }
    if (mealEvent && answer.events[mealEvent.slug] && answer.meal) {
      stmts.push(
        db
          .prepare(
            `INSERT INTO meal_choices (guest_id, meal_option_id, dietary_notes) VALUES (?1, ?2, ?3)
             ON CONFLICT (guest_id) DO UPDATE SET meal_option_id = excluded.meal_option_id, dietary_notes = excluded.dietary_notes`,
          )
          .bind(g.id, h.mealOptionIds[mealEvent.slug][answer.meal], answer.dietaryNotes || null),
      );
    } else {
      stmts.push(db.prepare('DELETE FROM meal_choices WHERE guest_id = ?1').bind(g.id));
    }
  }

  stmts.push(
    db.prepare('INSERT INTO submissions (household_id, payload_json) VALUES (?1, ?2)').bind(h.id, JSON.stringify(data)),
  );

  const results = await db.batch(stmts);
  const submissionId = results.at(-1)!.meta.last_row_id;

  /* ---- Confirmation email (after the response, so a slow email never blocks the guest) ---- */
  const updated = (await loadHousehold(db, h.id))!;
  const { tokenSecret } = requireSecrets(env);
  const editToken = await signHouseholdToken(tokenSecret, h.id, tokenExpiry(env));
  const editUrl = `${url.origin}/rsvp#t=${editToken}`;
  const msg = confirmationEmail(updated, editUrl, env.RSVP_DEADLINE);
  ctx.waitUntil(
    sendEmail(env, h.id, 'confirmation', { to: data.email, ...msg }, `confirmation-${submissionId}`).catch((e) =>
      console.error('confirmation email error', e),
    ),
  );

  return json(publicHousehold(updated, env.RSVP_DEADLINE, true));
}
