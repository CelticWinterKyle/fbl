// ─── Generic per-user rate limiter for data routes ────────────────────────────
// Fixed-window counter in KV: rl:{route}:{userId}:{windowIndex}. Mirrors the
// AI routes' fail-mode: dev (no KV) always allows; production without KV or
// with a KV error fails closed.

export async function checkUserRateLimit(
  userId: string,
  route: string,
  limit: number,
  windowS: number
): Promise<boolean> {
  // In production, no KV (or a KV failure) means fail closed; in dev, allow through.
  const failClosed = !!process.env.VERCEL && process.env.NODE_ENV === "production";
  if (!process.env.KV_REST_API_URL) return !failClosed;
  try {
    const { kv } = await import("@/lib/kv");
    const window = Math.floor(Date.now() / 1000 / windowS);
    const key = `rl:${route}:${userId}:${window}`;
    const count = (await kv.incr(key)) as number;
    if (count === 1) await kv.expire(key, windowS * 2);
    return count <= limit;
  } catch {
    return !failClosed;
  }
}
