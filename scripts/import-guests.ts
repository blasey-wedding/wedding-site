/**
 * Loads a guest list CSV into D1.
 *
 *   node scripts/import-guests.ts <guests.csv> --local|--remote [--replace]
 *   node scripts/import-guests.ts seeds/dummy-guests.csv --remote --preview [--replace]
 *
 * --preview targets the separate preview database (wedding-rsvp-preview, set up in
 * wrangler.preview-db.jsonc) instead of the real one. It only accepts the sample
 * files in seeds/, so real guest data can never end up there.
 *
 * Columns: household, first_name, last_name, nicknames, email, plus_one, welcome_party
 *   - One row per person; rows with the same `household` form one invitation.
 *   - nicknames: alternate first names separated by ";" (e.g. "Bob;Bobby").
 *   - email: put it on any row of the household (used for reminders).
 *   - plus_one: "yes" on any row gives the household an "and guest".
 *   - welcome_party: "yes" if that person is invited to the welcome party.
 *     Everyone is invited to the wedding.
 *
 * Keep the real CSV OUTSIDE the repo (e.g. ~/Documents/wedding/guests.csv).
 * The generated SQL goes to a temp file that is deleted afterwards.
 *
 * Without --replace the database must have no households yet.
 * --replace wipes guests and re-imports, but refuses once anyone has RSVP'd.
 */
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeName } from '../shared/rsvp.ts';

const REQUIRED = ['household', 'first_name', 'last_name', 'nicknames', 'email', 'plus_one', 'welcome_party'] as const;

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/* ---------- args ---------- */
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const target = args.includes('--remote') ? '--remote' : args.includes('--local') ? '--local' : null;
const replace = args.includes('--replace');
const preview = args.includes('--preview');
if (!file || !target) fail('Usage: node scripts/import-guests.ts <guests.csv> --local|--remote [--replace] [--preview]');
if (preview && target !== '--remote') fail('--preview only works with --remote (there is no local preview database).');

// The preview database has its own small config file, used only for database commands.
const DB_NAME = preview ? 'wedding-rsvp-preview' : 'wedding-rsvp';
const CONFIG_ARGS = preview ? ['--config', 'wrangler.preview-db.jsonc'] : [];

const csvPath = resolve(file);
const repoRoot = realpathSync(resolve(import.meta.dirname, '..'));
const rel = relative(repoRoot, realpathSync(csvPath));
const insideRepo = !rel.startsWith('..') && !isAbsolute(rel);
if (insideRepo && !rel.startsWith('seeds/dummy-')) {
  fail(`${rel} is inside the repo. Keep the real guest list outside it (e.g. ~/Documents/wedding/guests.csv).`);
}
if (preview && !(insideRepo && rel.startsWith('seeds/dummy-'))) {
  fail('The preview database is for sample guests only. Use a seeds/dummy-*.csv file with --preview.');
}

/* ---------- CSV parsing (RFC 4180: quotes, escaped quotes, newlines in quotes) ---------- */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
if (rows.length < 2) fail('The CSV has no guest rows.');
const header = rows[0].map((h) => h.trim().toLowerCase());
for (const col of REQUIRED) if (!header.includes(col)) fail(`Missing column "${col}". Expected: ${REQUIRED.join(', ')}`);
const col = (r: string[], name: (typeof REQUIRED)[number]) => (r[header.indexOf(name)] ?? '').trim();

const yesNo = (v: string, line: number, name: string): boolean => {
  const s = v.toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['', 'no', 'n', 'false', '0'].includes(s)) return false;
  fail(`Line ${line}: ${name} must be yes or no (got "${v}")`);
};

type Person = { first: string; last: string; nicknames: string[]; welcome: boolean };
type Household = { name: string; email: string | null; plusOne: boolean; people: Person[] };
const households = new Map<string, Household>();
const errors: string[] = [];

rows.slice(1).forEach((r, i) => {
  const line = i + 2;
  const household = col(r, 'household');
  const first = col(r, 'first_name');
  const last = col(r, 'last_name');
  if (!household || !first || !last) { errors.push(`Line ${line}: household, first_name and last_name are required`); return; }
  if (first.length > 60 || last.length > 60 || household.length > 120) errors.push(`Line ${line}: a name is too long`);
  const email = col(r, 'email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`Line ${line}: "${email}" doesn't look like an email`);

  const h = households.get(household) ?? { name: household, email: null, plusOne: false, people: [] };
  if (email) {
    if (h.email && h.email !== email) errors.push(`Line ${line}: ${household} has two different emails`);
    h.email = email;
  }
  h.plusOne ||= yesNo(col(r, 'plus_one'), line, 'plus_one');
  h.people.push({
    first,
    last,
    nicknames: col(r, 'nicknames').split(';').map((s) => s.trim()).filter(Boolean),
    welcome: yesNo(col(r, 'welcome_party'), line, 'welcome_party'),
  });
  households.set(household, h);
});
if (errors.length) fail(`Fix these and try again:\n  ${errors.join('\n  ')}`);

/* ---------- check the database state ---------- */
function wrangler(extra: string[], capture: boolean) {
  return spawnSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, target!, ...CONFIG_ARGS, ...extra], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
  });
}

const check = wrangler(
  ['--json', '--command', 'SELECT (SELECT COUNT(*) FROM households) AS h, (SELECT COUNT(*) FROM submissions) AS s, (SELECT COUNT(*) FROM events) AS e'],
  true,
);
if (check.status !== 0) fail('Could not read the database. Have you run the migrations (npm run db:migrate:local)?');
let state: { h: number; s: number; e: number };
try {
  state = JSON.parse(check.stdout)[0].results[0];
} catch {
  fail(`Unexpected output from wrangler:\n${check.stdout}`);
}
if (state.e === 0) fail('No events yet. Run npm run db:events:local (or :remote) first.');
if (state.h > 0 && !replace) fail(`The database already has ${state.h} households. Re-run with --replace to start over.`);
if (state.s > 0) fail(`${state.s} RSVPs have been submitted, so the guest list can't be wiped. Make changes with a migration instead.`);

/* ---------- build SQL ---------- */
const q = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/\0/g, '').replace(/'/g, "''")}'`);
const invite = (guestId: number, slug: string) =>
  `INSERT INTO invitations (guest_id, event_id) SELECT ${guestId}, id FROM events WHERE slug = ${q(slug)};`;

const sql: string[] = [];
if (replace) sql.push('DELETE FROM emails;', 'DELETE FROM households;');

let hid = 0;
let gid = 0;
let people = 0;
for (const h of households.values()) {
  hid++;
  sql.push(`INSERT INTO households (id, display_name, email, plus_one_allowed) VALUES (${hid}, ${q(h.name)}, ${q(h.email)}, ${h.plusOne ? 1 : 0});`);
  h.people.forEach((p, i) => {
    gid++;
    people++;
    sql.push(`INSERT INTO guests (id, household_id, first_name, last_name, is_plus_one, sort_order) VALUES (${gid}, ${hid}, ${q(p.first)}, ${q(p.last)}, 0, ${i});`);
    const names = new Set([p.first, ...p.nicknames].map((f) => normalizeName(`${f} ${p.last}`)));
    for (const n of names) sql.push(`INSERT OR IGNORE INTO guest_search_names (guest_id, name_normalized) VALUES (${gid}, ${q(n)});`);
    sql.push(invite(gid, 'wedding'));
    if (p.welcome) sql.push(invite(gid, 'welcome'));
  });
  if (h.plusOne) {
    gid++;
    sql.push(`INSERT INTO guests (id, household_id, is_plus_one, sort_order) VALUES (${gid}, ${hid}, 1, 99);`);
    sql.push(invite(gid, 'wedding'));
    if (h.people.some((p) => p.welcome)) sql.push(invite(gid, 'welcome'));
  }
}

/* ---------- run ---------- */
const dir = mkdtempSync(join(tmpdir(), 'wedding-import-'));
const sqlFile = join(dir, 'import.sql');
writeFileSync(sqlFile, sql.join('\n') + '\n', { mode: 0o600 });
try {
  const run = wrangler(['--file', sqlFile], false);
  if (run.status !== 0) fail('Import failed (see the wrangler output above). Nothing was committed if the error came from D1.');
} finally {
  unlinkSync(sqlFile);
}

const plusOnes = [...households.values()].filter((h) => h.plusOne).length;
console.log(`\n✔ Imported ${households.size} households, ${people} guests, ${plusOnes} plus-one slots into ${DB_NAME} (${target!.slice(2)}).\n`);
