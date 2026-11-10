# Launch checklist

Everything left to do, in order. **You** = something only you can do (accounts, content, decisions). **Claude** = code to be written in a later session. Tick items off as you go.

Live at **https://blaseywedding.com** · Code at **github.com/blasey-wedding/wedding-site** (public)

## Done

- [x] Node 24 installed and pinned with `.nvmrc`
- [x] Site running locally (`npm run dev`)
- [x] Romantic envelope design, maroon palette
- [x] Blue scratch-ticket design saved in `/archive/summer-pop-save-the-date/`
- [x] RSVP approach chosen: name search (no invite codes), welcome party as a separate event, per-guest meal choice
- [x] Draft RSVP schema in `migrations/0001_rsvp_schema.sql`
- [x] GitHub organization `blasey-wedding`, public repo `wedding-site`, first commit tagged `v1`
- [x] Cloudflare Workers connected to GitHub: every push to `main` deploys, every branch gets a preview URL
- [x] Domain `blaseywedding.com` bought through Cloudflare (paid through Nov 9, 2028, auto-renew on)
- [x] `blaseywedding.com` and `www.blaseywedding.com` attached to the Worker with HTTPS
- [x] `site` in `astro.config.mjs` set to the real domain
- [x] Plain `workers.dev` address turned off (`workers_dev: false`); previews stay on (`preview_urls: true`)
- [x] Kept out of search engines: `X-Robots-Tag` header (`public/_headers`), robots meta tag, `robots.txt` blocking all crawlers

## 1. Cloudflare odds and ends

- [ ] **You:** Turn on AI-crawler blocking for `blaseywedding.com` (under **Security** or **AI Crawl Control**)
- [ ] **You (optional):** Redirect `www` to the root domain (**Rules → Redirect Rules → "Redirect from WWW to root"** template)
- [ ] **You (optional):** Invite Casey to the Cloudflare account
- [ ] **You (optional):** Turn on Email Routing so `hello@blaseywedding.com` forwards to Gmail

## 2. Content

- [ ] **You:** Send Claude the details below; Claude returns snippets to paste into `src/data/wedding.ts`
  - [ ] Venue display name (currently "Venue name")
  - [ ] Ceremony start time (countdown currently assumes 4:00 PM Eastern)
  - [ ] Welcome party: date, time, place
  - [ ] Hotels: real names, booking links, block codes, book-by dates (placeholders remain)
  - [ ] Story timeline entries (`story`)
  - [ ] Registry link
  - [ ] Confirm FAQ answers (adults-only, "and guest" plus-ones, dress code)
- [ ] **Claude:** Add sections for anything new (welcome party / schedule, registry, add-to-calendar)
- [ ] **You:** Decide whether the archived blue design stays public at `/archive/`
- [ ] **You:** Gather engagement photos
- [ ] **Claude:** Script to resize, compress, and strip location data from photos before they're committed (the repo is public, and git history is permanent)
- [ ] **You:** Replace placeholders in `src/assets/photos/` (`photo-01.jpg`, `photo-02.jpg`, … in display order)
- [ ] **You:** Pick background photos in `sectionPhotos` (hero, "The day", footer)
- [ ] **You:** Write alt text in `photoAlts`, gallery photos first
- [ ] **Claude:** Check the hero countdown and scroll cue (they looked like gray boxes in the screenshot) and the mobile layout
- [ ] **You:** Test on your phone: `npm run dev -- --host`, open the "Network" address on the same Wi-Fi
- [ ] **You:** Show Casey, then make final tweaks
- [ ] **You:** Snapshot: `npm run snapshot romantic-save-the-date`
- [ ] **You:** Text yourself the link, check the preview image and title, then send it with the save-the-dates

## 3. Safe updates while live

- [ ] **Claude:** Playwright tests: page loads, the envelope opens, the date is present, the gallery opens, no console errors
- [ ] **Claude:** GitHub Action that builds and runs the tests on every pull request
- [ ] **You:** Turn on branch protection for `main` so pull requests must pass the tests before merging (free, since the repo is public)
- [ ] **You:** From now on, make every change on a branch, check the preview URL, then merge

## 4. RSVP (v2)

Decisions:

- [x] Guests find themselves by name search (full first and last name, nicknames supported). No codes to print.
- [x] Kids: adults-only (already stated in the FAQ)
- [ ] **You:** Confirm plus-one policy matches the FAQ ("and guest" means bring anyone)
- [ ] **You:** Welcome party: everyone invited, or only some guests?
- [ ] **You:** Meal options from the caterer, and whether you want dietary/allergy notes
- [ ] **You:** RSVP deadline (usually 4–6 weeks before, or whenever the caterer needs counts)
- [ ] **You:** Which extras to ask: shuttle seats, hotel, song request, note to the couple, mailing address

Accounts and setup:

- [ ] **You:** Prepare the guest list CSV: household, first name, last name, nicknames, email, plus-one allowed, invited to welcome party. **Never commit this file to git.**
- [ ] **You:** Create a Resend account and verify `blaseywedding.com` (it adds DNS records in Cloudflare). Free plan allows 100 emails a day: plenty for confirmations; reminder blasts may need to go out over a few days.
- [ ] **You:** Turn on Cloudflare Access for preview URLs (Worker → **Settings**), so only you can open branch previews once they contain the RSVP form
- [ ] **You:** Upgrade to Workers Paid ($5/month) from invitations until the wedding, for 30 days of D1 point-in-time recovery instead of 7

Code:

- [ ] **Claude:** Finalize the D1 schema and create the database
- [ ] **Claude:** Script to import the guest CSV straight into D1, without it touching the repo
- [ ] **Claude:** Name search API: case- and accent-insensitive, full-name matches only, never returns partial lists; Turnstile and rate limiting
- [ ] **Claude:** RSVP page and form (in the site's design): whole household at once, welcome party and wedding, meals for attendees, edit until the deadline
- [ ] **Claude:** Append-only log of every submission, so no answer is ever lost to an edit
- [ ] **Claude:** Shared Zod validation between form and Worker
- [ ] **Claude:** Confirmation email showing exactly what was submitted, with an add-to-calendar file
- [ ] **Claude:** Admin page (behind Cloudflare Access): headcount per event, meal totals, who hasn't replied, CSV export, reminder emails
- [ ] **Claude:** Nightly CSV backup to R2, also emailed to you
- [ ] **Claude:** Tests covering the RSVP flow end to end
- [ ] **Claude (optional, can ship early):** Mailing-address form that goes live with the save-the-date

Launch:

- [ ] **You:** Snapshot the save-the-date design before switching: `npm run snapshot save-the-date-final`
- [ ] **You:** Family dry run on real phones (iPhone and Android), including trying to break the form and searching for nicknames and misspellings
- [ ] **You:** Practice restoring from a backup once, so you know it works before you need it
- [ ] **You:** Tag the release (`git tag v2-rsvp`) and send the invitations

## 5. After the RSVP deadline

- [ ] **You:** Close the RSVP form (the deadline in config does this automatically)
- [ ] **You:** Export final counts for the caterer and the seating chart
- [ ] **You:** After the wedding: snapshot the final site, then switch it to a thank-you and photos page
