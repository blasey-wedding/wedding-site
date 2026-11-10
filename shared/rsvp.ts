/**
 * Shared between the browser (src/pages/rsvp.astro, admin.astro), the Worker
 * (worker/), and the import script, so all three agree on names and shapes.
 */
import { z } from 'zod';

/**
 * Turns whatever a guest types into the form stored in guest_search_names.
 * "  José  O’Brien-Smith " -> "jose obrien smith"
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/['’‘`.]/g, '') // apostrophes and periods disappear: O'Brien -> obrien
    .replace(/[^a-z0-9]+/g, ' ') // hyphens and anything else become spaces
    .trim()
    .replace(/\s+/g, ' ');
}

const name = z.string({ error: 'Required' }).trim().min(1, 'Required').max(60, 'Too long');

export const lookupRequest = z.object({
  firstName: name,
  lastName: name,
  turnstileToken: z.string({ error: 'Please complete the check' }).min(1, 'Please complete the check').max(4096),
});
export type LookupRequest = z.infer<typeof lookupRequest>;

export const guestAnswer = z.object({
  guestId: z.number().int().positive(),
  /** Only accepted for plus-ones; everyone else's name comes from the guest list. */
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  /** event slug -> attending */
  events: z.record(z.string().max(40), z.boolean()),
  meal: z.string().max(40).optional(),
  dietaryNotes: z.string().trim().max(300).optional(),
});
export type GuestAnswer = z.infer<typeof guestAnswer>;

export const submitRequest = z.object({
  email: z.email({ error: 'Please enter a valid email' }).max(254),
  guests: z.array(guestAnswer).min(1).max(20),
  shuttleSeats: z.number().int().min(0).max(20).optional(),
  songRequest: z.string().trim().max(200).optional(),
  noteToCouple: z.string().trim().max(1000).optional(),
});
export type SubmitRequest = z.infer<typeof submitRequest>;

/* ---------- API response shapes ---------- */

export type RsvpStatus = 'not-open' | 'open' | 'closed';

export type ConfigResponse = {
  status: RsvpStatus;
  /** True on preview and local URLs, where the RSVP is always open for testing. */
  testMode: boolean;
  opensAt: string;
  deadline: string;
  turnstileSiteKey: string;
};

export type LookupMatch = { token: string; label: string };
export type LookupResponse = { matches: LookupMatch[] };

export type HouseholdEvent = {
  slug: string;
  name: string;
  startsAt: string;
  location: string | null;
  asksMeal: boolean;
  mealOptions: { slug: string; label: string }[];
};

export type HouseholdGuest = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  isPlusOne: boolean;
  /** event slug -> current answer (null = not answered yet), only for invited events */
  events: Record<string, boolean | null>;
  meal: string | null;
  dietaryNotes: string | null;
};

export type HouseholdResponse = {
  displayName: string;
  email: string | null;
  shuttleSeats: number | null;
  songRequest: string | null;
  noteToCouple: string | null;
  hasResponded: boolean;
  events: HouseholdEvent[];
  guests: HouseholdGuest[];
  deadline: string;
  canEdit: boolean;
};

export type ApiError = { error: string; fields?: Record<string, string> };

/** Flattens Zod issues into { "guests.0.meal": "message" } for showing next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

export function guestDisplayName(g: { firstName: string | null; lastName: string | null; isPlusOne: boolean }): string {
  const full = [g.firstName, g.lastName].filter(Boolean).join(' ');
  return full || (g.isPlusOne ? 'Your guest' : 'Guest');
}
