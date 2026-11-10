# Launch checklist

Everything left to do, in order. **You** = something only you can do (accounts, content, decisions). **Claude** = code to be written in a later session. Tick items off as you go.

## Done

- [x] Node 24 installed and pinned with `.nvmrc`
- [x] Site running locally (`npm run dev`)
- [x] Romantic envelope design, maroon palette
- [x] Blue scratch-ticket design saved in `/archive/summer-pop-save-the-date/`

## 1. Content (first iteration)

- [ ] **You:** Fill in `src/data/wedding.ts`
  - [ ] Real date, plus the venue's UTC offset in `dateISO` (e.g. `-05:00` for Central Daylight Time), so the countdown is exact
  - [ ] Venue name, address, Google Maps link
  - [ ] Story timeline entries (`story`)
  - [ ] Hotels: names, booking links, block codes, book-by dates
  - [ ] Airports
  - [ ] FAQ answers (kids, plus-ones, dress code)
  - [ ] Contact email and hashtag
- [ ] **You:** Replace placeholders in `src/assets/photos/` with your engagement photos (named `photo-01.jpg`, `photo-02.jpg`, … in display order)
- [ ] **You:** Pick background photos in `sectionPhotos` (hero, "The day", footer)
- [ ] **You:** Add alt text for photos in `photoAlts` (short descriptions for screen readers)
- [ ] **You:** Test on your phone: run `npm run dev -- --host` and open the "Network" address over the same Wi-Fi
- [ ] **You:** Show Casey, then make any final tweaks
- [ ] **You:** Take a snapshot once you're both happy: `npm run snapshot romantic-save-the-date`

## 2. Accounts and code storage

- [ ] **You:** Create a GitHub organization (optional, e.g. `blake-and-casey`) and invite Casey as an owner
- [ ] **You:** In the project folder: `git init`, `git add -A`, `git commit -m "Save the date v1"`, `git tag v1`
- [ ] **You:** Create a GitHub repo and push the project to it
- [ ] **You:** Create a Cloudflare account and invite Casey as a member

## 3. Go live

- [ ] **You:** Buy the domain through Cloudflare Registrar
- [ ] **You:** In Cloudflare, go to **Workers & Pages → Create → Import a repository**, then set the build command to `npm run build` and the deploy command to `npx wrangler deploy`
- [ ] **You:** Attach the domain: Worker → **Settings → Domains & Routes**
- [ ] **You:** Set `site` in `astro.config.mjs` to the real domain
- [ ] **You:** Text the link to yourself and check that the preview image and title look right
- [ ] **You:** Send the link with your save-the-dates

## 4. Safe updates while live

- [ ] **Claude:** Playwright tests: page loads, the envelope opens, the date is present, the gallery opens, no console errors
- [ ] **Claude:** GitHub Action that builds and runs the tests on every pull request
- [ ] **You:** Turn on branch protection for `main` so pull requests must pass the tests before merging
- [ ] **You:** From now on, make every change on a branch, check the preview URL, then merge

## 5. RSVP (v2)

Decisions to make first:

- [ ] **You:** Closed guest list (recommended): who is invited, grouped by household
- [ ] **You:** Plus-one policy (by name, "and guest", or none)
- [ ] **You:** Kids policy
- [ ] **You:** Meal options from the caterer, plus whether you need dietary or allergy notes
- [ ] **You:** RSVP deadline (usually 4–6 weeks before the wedding, or whenever the caterer needs counts)
- [ ] **You:** How guests look themselves up: invite code printed on the invitation, or name lookup. If you use codes, they must be generated **before the invitations are printed**.

Accounts and setup:

- [ ] **You:** Prepare the guest list as a CSV with household, name, email, and plus-one allowance. **Never commit this file to git.**
- [ ] **You:** Create a Resend account and verify your domain (it adds DNS records in Cloudflare) so confirmation emails come from your address
- [ ] **You:** Upgrade to the Workers Paid plan ($5/month) from the time invitations go out until the wedding

Code:

- [ ] **Claude:** D1 database and schema: households, guests, rsvps, with constraints on meals and one RSVP per guest
- [ ] **Claude:** Script to import the guest CSV straight into D1, without it touching the repo
- [ ] **Claude:** Invite code generator
- [ ] **Claude:** RSVP page and form (in the site's design), with edit-until-deadline
- [ ] **Claude:** Worker API with shared Zod validation, Turnstile spam protection, and rate limiting
- [ ] **Claude:** Confirmation email showing exactly what was submitted
- [ ] **Claude:** Admin page (behind Cloudflare Access) with headcount, meal totals, and who hasn't replied
- [ ] **Claude:** Nightly CSV backup to R2, also emailed to you
- [ ] **Claude:** Tests covering the RSVP flow end to end

Launch:

- [ ] **You:** Snapshot the save-the-date design before switching: `npm run snapshot save-the-date-final`
- [ ] **You:** Family dry run on real phones (iPhone and Android), including trying to break the form
- [ ] **You:** Practice restoring from a backup once, so you know it works before you need it
- [ ] **You:** Tag the release (`git tag v2-rsvp`) and send the invitations

## 6. After the RSVP deadline

- [ ] **You:** Close the RSVP form (the deadline in config does this automatically)
- [ ] **You:** Export final counts for the caterer and the seating chart
- [ ] **You:** After the wedding: snapshot the final site, then switch it to a thank-you and photos page
