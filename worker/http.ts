import type { ApiError } from '../shared/rsvp';

const baseHeaders = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

export function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...baseHeaders, 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

export function error(status: number, message: string, fields?: Record<string, string>): Response {
  const body: ApiError = fields ? { error: message, fields } : { error: message };
  return json(body, status);
}

export function text(body: string, contentType: string, extra: HeadersInit = {}): Response {
  return new Response(body, { headers: { ...baseHeaders, 'content-type': contentType, ...extra } });
}

/** Thrown inside handlers to return a specific error response. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

const MAX_BODY_BYTES = 32 * 1024;

/** Reads a JSON body with a size cap. Rejects non-JSON content types. */
export async function readJson(request: Request): Promise<unknown> {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
    throw new HttpError(415, 'Expected JSON');
  }
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large');
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request too large');
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

/** Blocks cross-site form posts: a POST must come from this same origin. */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-origin request blocked');
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}
