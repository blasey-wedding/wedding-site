/**
 * The site is static (Astro builds it into dist/). This Worker only runs for
 * /api/* (see "run_worker_first" in wrangler.jsonc); every other path is served
 * straight from the static assets.
 */
import type { Env } from './env';
import { HttpError, error } from './http';
import { getConfig, getHousehold, lookup, submit } from './rsvp';
import { requireAdmin } from './access';
import { exportCsv, households, remind, summary } from './admin';

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;

  switch (key) {
    case 'GET /api/rsvp/config':
      return getConfig(env, url);
    case 'POST /api/rsvp/lookup':
      return lookup(request, env, ctx);
    case 'GET /api/rsvp/household':
      return getHousehold(request, env);
    case 'POST /api/rsvp/submit':
      return submit(request, env, ctx);
  }

  if (url.pathname.startsWith('/api/admin/')) {
    const admin = await requireAdmin(request, env);
    switch (key) {
      case 'GET /api/admin/summary':
        return summary(request, env, admin);
      case 'GET /api/admin/households':
        return households(env);
      case 'GET /api/admin/export.csv':
        return exportCsv(env);
      case 'POST /api/admin/remind':
        return remind(request, env);
    }
  }

  if (url.pathname.startsWith('/api/')) return error(404, 'Not found');
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      if (e instanceof HttpError) return error(e.status, e.message, e.fields);
      console.error('Unhandled error', e);
      return error(500, 'Something went wrong on our end. Please try again, or email us.');
    }
  },
} satisfies ExportedHandler<Env>;
