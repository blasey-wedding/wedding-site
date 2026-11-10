// Unit tests for the pieces shared by the browser, Worker, and import script.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, submitRequest, lookupRequest, fieldErrors } from '../shared/rsvp.ts';
import { signHouseholdToken, verifyHouseholdToken } from '../worker/token.ts';

test('normalizeName ignores case, accents, punctuation, and spacing', () => {
  assert.equal(normalizeName('  José   GARCÍA '), 'jose garcia');
  assert.equal(normalizeName("Siobhan O'Brien-Murphy"), 'siobhan obrien murphy');
  assert.equal(normalizeName('Siobhan O’Brien Murphy'), 'siobhan obrien murphy');
  assert.equal(normalizeName('Mary-Kate Smith'), normalizeName('mary kate smith'));
  assert.equal(normalizeName('Dr. Chris Taylor Jr.'), 'dr chris taylor jr');
});

test('lookupRequest requires both names and a Turnstile token', () => {
  const r = lookupRequest.safeParse({ firstName: ' ', lastName: 'Lee' });
  assert.equal(r.success, false);
  if (!r.success) {
    const f = fieldErrors(r.error);
    assert.ok(f.firstName);
    assert.equal(f.turnstileToken, 'Please complete the check');
  }
  assert.equal(lookupRequest.safeParse({ firstName: 'Jordan', lastName: 'Lee', turnstileToken: 'x' }).success, true);
});

test('submitRequest validates email, guests, and limits', () => {
  const ok = { email: 'a@example.com', guests: [{ guestId: 1, events: { wedding: true }, meal: 'chicken' }] };
  assert.equal(submitRequest.safeParse(ok).success, true);
  assert.equal(submitRequest.safeParse({ ...ok, email: 'nope' }).success, false);
  assert.equal(submitRequest.safeParse({ ...ok, guests: [] }).success, false);
  assert.equal(submitRequest.safeParse({ ...ok, shuttleSeats: 99 }).success, false);
  assert.equal(submitRequest.safeParse({ ...ok, noteToCouple: 'x'.repeat(1001) }).success, false);
});

test('household tokens round-trip and reject tampering, other secrets, and expiry', async () => {
  const future = new Date(Date.now() + 3600_000);
  const token = await signHouseholdToken('secret-a', 42, future);
  assert.equal(await verifyHouseholdToken('secret-a', token), 42);
  assert.equal(await verifyHouseholdToken('secret-b', token), null);

  const [payload, sig] = token.split('.');
  const forged = Buffer.from('43.' + Math.floor(future.getTime() / 1000)).toString('base64url');
  assert.equal(await verifyHouseholdToken('secret-a', `${forged}.${sig}`), null);
  assert.equal(await verifyHouseholdToken('secret-a', `${payload}.${sig}x`), null);
  assert.equal(await verifyHouseholdToken('secret-a', 'garbage'), null);

  const expired = await signHouseholdToken('secret-a', 42, new Date(Date.now() - 1000));
  assert.equal(await verifyHouseholdToken('secret-a', expired), null);
});
