# Launch checklist

Everything left to do, in order. **You** = something only you can do (accounts, content, decisions). **Claude** = code to be written in a later session. Tick items off as you go.

## Done

- [x] Node 24 installed and pinned with `.nvmrc`
- [x] Site running locally (`npm run dev`)
- [x] Romantic envelope design, maroon palette
- [x] Blue scratch-ticket design saved in `/archive/summer-pop-save-the-date/`
- [x] RSVP approach chosen: name search (no invite codes), welcome party as a separate event, per-guest meal choice

## 1. Code storage and preview deploys

- [ ] **You:** Decide public or private repo. A free GitHub organization can't enforce branch protection on private repos (that needs the Team plan). Public is fine as long as the guest list and secrets never touch git.
- [ ] **You:** Create the GitHub organization (e.g. `blake-and-casey`) and invite Casey as an owner
- [ ] **You:** Check `.gitignore` covers `node_modules/`, `dist/`, `.astro/`, `.wrangler/`, `.env*`, `.dev.vars`, and `*.csv`
- [ ] **You:** In the project folder: `git init`, `git add -A`, `git commit -m "Save the date v1"`, `git tag v1`
- [ ] **You:** Create the repo in the organization and push
- [ ] **You:** Invite Casey to the Cloudflare account as a member
- [ ] **You:** In Cloudflare, go to **Workers & Pages → Create → Import a repository** (install the Cloudflare GitHub app on the organization when asked), then set the build command to `npm run build` and the deploy command to `npx wrangler deploy`
- [ ] **Claude:** Add a `noindex` meta tag so search engines skip the site until launch
- [ ] **You:** Open the `workers.dev` preview URL on your phone and check it matches local

## 2. Domain and email

- [ ] **You:** Buy the domain through Cloudflare Registrar
- [ ] **You:** Attach the domain: Worker → **Settings → Domains & Routes**
- [ ] **You:** Set `site` in `astro.config.mjs` to the real domain
- [ ] **You:** Create a Resend account and verify the domain (it adds DNS records in Cloudflare). Free plan allows 100 emails a day: plenty for confirmations, but reminder blasts may need to go out over a few days or on a paid month.
- [ ] **You (optional):** Turn on Cloudflare Email Routing so an address like `hello@yourdomain` forwards to Gmail

## 3. Content

- [ ] **You:** Fill in `src/data/wedding.ts`
  - [ ] Ceremony start time in `dateISO` (countdown currently assumes 4:00 PM Eastern)
  - [ ] Venue display name (currently "Venue name")
  - [ ] Story timeline entries (`story`)
  - [ ] Hotels: real names, booking links, block codes, book-by dates (placeholders remain)
  - [ ] Welcome party: date, time, place
  - [ ] Registry link
- [ ] **You:** Replace placeholders in `src/assets/photos/` with engagement photos (`photo-01.jpg`, `photo-02.jpg`, … in display order). Claude will help resize them and strip location data.
- [ ] **You:** Pick background photos in `sectionPhotos` (hero, "The day", footer)
- [ ] **You:** Add alt text in `photoAlts`, gallery photos first
- [ ] **You:** Test on your phone: `npm run dev -- --host`, open the "Network" address on the same Wi-Fi
- [ ] **You:** Show Casey, then make final tweaks
- [ ] **You:** Snapshot: `npm run snapshot romantic-save-the-date`
- [ ] **Claude:** Remove the `noindex` tag
- [ ] **You:** Text yourself the link, check the preview image and title, then send it with the save-the-dates

## 4. Safe updates while live

- [ ] **Claude:** Playwright tests: page loads, the envelope opens, the date is present, the gallery opens, no console errors
- [ ] **Claude:** GitHub Action that builds and runs the tests on every pull request
- [ ] **You:** Turn on branch protection for `main` (public repo, or private on GitHub Team) so pull requests must pass tests before merging
- [ ] **You:** From now on, make every change on a branch, check the preview URL, then merge

## 5. RSVP (v2)

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
- [ ] **You:** Upgrade to Workers Paid ($5/month) from invitations until the wedding. Free limits easily cover a wedding, but Paid keeps 30 days of D1 point-in-time recovery instead of 7.

Code:

- [ ] **Claude:** D1 schema (draft in `migrations/0001_rsvp_schema.sql`)
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

## 6. After the RSVP deadline

- [ ] **You:** Close the RSVP form (the deadline in config does this automatically)
- [ ] **You:** Export final counts for the caterer and the seating chart
- [ ] **You:** After the wedding: snapshot the final site, then switch it to a thank-you and photos page
