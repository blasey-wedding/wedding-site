# RSVP system

## How it fits together

- **Astro** builds the whole site, including `/rsvp` and `/admin`, as static pages in `dist/`.
- **The Worker** (`worker/index.ts`) runs only for `/api/*` (`run_worker_first` in `wrangler.jsonc`). Everything else is served straight from `dist/`.
- **D1** (`wedding-rsvp`) stores households, guests, invitations, answers, meals, an append-only log of every submission, every email sent, and rate-limit counters. Schema: `migrations/`.
- **`shared/rsvp.ts`** holds the name normalizer, the Zod schemas, and the API types. The form, the Worker, and the import script all use it, so they can't disagree.

| Endpoint | What it does |
| --- | --- |
| `GET /api/rsvp/config` | Open / not open / closed, dates, Turnstile site key |
| `POST /api/rsvp/lookup` | Full name + Turnstile → signed household token(s). Rate limited per IP |
| `GET /api/rsvp/household` | The household's guests, invitations, and current answers (token required) |
| `POST /api/rsvp/submit` | Validates against the household's invitations, writes everything in one transaction, emails a confirmation |
| `GET /api/admin/summary`, `/households`, `/export.csv`, `POST /api/admin/remind` | Dashboard data. Cloudflare Access JWT required, verified in the Worker |

**Test mode:** on any host not listed in `PRODUCTION_HOSTS` (preview URLs, localhost) the RSVP is always open and a banner says so. On `blaseywedding.com` it follows `RSVP_OPENS` / `RSVP_DEADLINE`, so it's safe to merge before launch.

**Emails:** without `RESEND_API_KEY`, emails are logged (terminal locally, Workers logs in production) and recorded in the `emails` table as `logged`.

## Local development

```bash
cp dev.vars.example .dev.vars   # once
npm run db:reset:local          # fresh local database with sample guests
npm run dev:full                # builds the site, serves site + API at http://localhost:8787
```

- `/rsvp`: try "Bob Okafor", "Jose Garcia", "Shiv O'Brien Murphy", "Jordan Lee" (has a plus-one), or "Alex Kim" (two matches).
- `/admin`: works on localhost without signing in (`ADMIN_DEV_BYPASS`).
- `npm run dev` still works for design work on the main page, but has no API.
- `npm test` runs unit tests; `npm run typecheck` checks the Worker.

## Database commands

| Command | Does |
| --- | --- |
| `npm run db:migrate:local` / `:remote` | Apply new migrations |
| `npm run db:events:local` / `:remote` | Load or update events and meal options from `seeds/events.sql` |
| `npm run db:dummy:local` / `:remote` | Replace the guest list with the sample data |
| `node scripts/import-guests.ts ~/path/guests.csv --remote --replace` | Load the real guest list (refuses once anyone has replied) |

Never edit a migration after it has been applied remotely. Add `0002_...sql` instead.

## Setting up Cloudflare Access for /admin (before real data)

1. Cloudflare dashboard → **Zero Trust** (pick a team name; the free plan is enough).
2. **Access → Applications → Add → Self-hosted.** Add two destinations: `blaseywedding.com/admin` and `blaseywedding.com/api/admin`. Policy: allow your two email addresses.
3. Copy the application's **AUD tag** and your team domain (`https://<team>.cloudflareaccess.com`) into `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` in `wrangler.jsonc`.
4. To use admin on preview URLs too, turn on **Protect with Cloudflare Access** for previews in the Worker's settings and add that application's AUD to `ACCESS_AUD` (comma-separated).

## Going live with real guests

1. Real dates in `wrangler.jsonc` (`RSVP_OPENS`, `RSVP_DEADLINE`) and real events and meals in `seeds/events.sql`.
2. Real Turnstile widget (Cloudflare → Turnstile → Add widget for `blaseywedding.com`): site key in `wrangler.jsonc`, secret with `npx wrangler secret put TURNSTILE_SECRET`.
3. A new random `TOKEN_SECRET` (`openssl rand -base64 32`, then `npx wrangler secret put TOKEN_SECRET`).
4. Resend: verify the domain, then `npx wrangler secret put RESEND_API_KEY`.
5. Give previews their own database so tests never touch real answers.
6. Delete and recreate the remote database (so no sample replies remain), run migrations and events, import the real CSV.
