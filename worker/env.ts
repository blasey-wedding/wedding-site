/** Bindings and settings. Non-secret values live in wrangler.jsonc "vars";
 *  secrets live in .dev.vars locally and `wrangler secret put` in production. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // vars
  PRODUCTION_HOSTS: string; // comma-separated; everywhere else is "test mode"
  RSVP_OPENS: string; // ISO 8601 with offset
  RSVP_DEADLINE: string; // ISO 8601 with offset; edits close at this moment
  TURNSTILE_SITE_KEY: string;
  EMAIL_FROM: string; // e.g. "Blake & Casey <rsvp@blaseywedding.com>"
  EMAIL_REPLY_TO: string;
  ACCESS_TEAM_DOMAIN: string; // e.g. "https://blasey.cloudflareaccess.com" ('' until set up)
  ACCESS_AUD: string; // comma-separated Access application AUD tags ('' until set up)

  // secrets
  TOKEN_SECRET?: string;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string; // unset = emails are logged, not sent
  ADMIN_DEV_BYPASS?: string; // "true" in .dev.vars only; honored on localhost only
}
