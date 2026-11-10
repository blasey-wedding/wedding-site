/**
 * Fixed-window rate limiting stored in D1, so it works the same locally,
 * on previews, and in production. Returns true if the request is allowed.
 */
export async function rateLimit(db: D1Database, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}

/** Occasional cleanup of old windows; call from waitUntil. */
export async function pruneRateLimits(db: D1Database): Promise<void> {
  if (Math.random() > 0.02) return;
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 3600;
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(cutoff).run();
}
