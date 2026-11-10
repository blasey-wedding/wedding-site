/**
 * Admin requests must carry a valid Cloudflare Access JWT. Access sits in front
 * of /admin and /api/admin at the edge; verifying the token here as well means a
 * misconfigured Access policy fails closed instead of exposing guest data.
 */
import type { Env } from './env';
import { HttpError } from './http';

type Jwk = JsonWebKey & { kid: string };
let certCache: { team: string; keys: Jwk[]; fetchedAt: number } | null = null;

async function accessKeys(team: string, forceRefresh = false): Promise<Jwk[]> {
  if (!forceRefresh && certCache && certCache.team === team && Date.now() - certCache.fetchedAt < 3600_000) return certCache.keys;
  const res = await fetch(`${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new HttpError(503, 'Couldn’t reach Cloudflare Access');
  const { keys } = (await res.json()) as { keys: Jwk[] };
  certCache = { team, keys, fetchedAt: Date.now() };
  return keys;
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

function readCookie(request: Request, name: string): string | null {
  const m = (request.headers.get('cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

/** Returns the signed-in admin's email, or throws 401/403/503. */
export async function requireAdmin(request: Request, env: Env): Promise<string> {
  const url = new URL(request.url);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (env.ADMIN_DEV_BYPASS === 'true' && isLocal) return 'dev@localhost';

  const team = env.ACCESS_TEAM_DOMAIN?.replace(/\/$/, '');
  const auds = (env.ACCESS_AUD ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!team || auds.length === 0) throw new HttpError(503, 'Admin isn’t set up yet: Cloudflare Access hasn’t been configured');

  const token = request.headers.get('cf-access-jwt-assertion') ?? readCookie(request, 'CF_Authorization');
  if (!token) throw new HttpError(401, 'Please sign in through Cloudflare Access');

  const [h64, p64, s64] = token.split('.');
  if (!h64 || !p64 || !s64) throw new HttpError(401, 'Invalid sign-in token');

  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(h64)));
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p64)));
  } catch {
    throw new HttpError(401, 'Invalid sign-in token');
  }
  if (header.alg !== 'RS256' || !header.kid) throw new HttpError(401, 'Invalid sign-in token');

  let jwk = (await accessKeys(team)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await accessKeys(team, true)).find((k) => k.kid === header.kid); // keys rotate
  if (!jwk) throw new HttpError(401, 'Unknown signing key');

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s64), new TextEncoder().encode(`${h64}.${p64}`));
  if (!valid) throw new HttpError(401, 'Invalid sign-in token');

  const now = Math.floor(Date.now() / 1000);
  const tokenAuds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!tokenAuds.some((a) => a && auds.includes(a))) throw new HttpError(403, 'Not authorized for this app');
  if (payload.iss !== team) throw new HttpError(401, 'Invalid sign-in token');
  if (!payload.exp || payload.exp < now || (payload.nbf && payload.nbf > now + 60)) throw new HttpError(401, 'Sign-in expired');

  return payload.email ?? 'unknown';
}
