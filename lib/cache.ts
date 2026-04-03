// ─── In-process cache (dev) ───────────────────────────────────────────────────

type Entry = { value: unknown; expiresAt: number };
const memCache = new Map<string, Entry>();

function memGet<T>(key: string): T | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function memSet(key: string, value: unknown, ttlSeconds: number): void {
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ─── KV helpers ──────────────────────────────────────────────────────────────

function isKvAvailable(): boolean {
  return !!process.env.KV_REST_API_URL;
}

async function kvGet<T>(key: string): Promise<T | null> {
  const { kv } = await import("@vercel/kv");
  return kv.get<T>(key);
}

async function kvSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const { kv } = await import("@vercel/kv");
  await kv.set(key, value, { ex: ttlSeconds });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read-through cache. Calls fetcher on miss; stores result for ttlSeconds.
 * In production (KV available): uses Vercel KV.
 * In development: uses in-process memory.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const cached = isKvAvailable()
      ? await kvGet<T>(key)
      : memGet<T>(key);

    if (cached !== null) return cached;
  } catch {
    // Cache read failure → proceed to fetcher
  }

  const value = await fetcher();

  try {
    if (isKvAvailable()) {
      await kvSet(key, value, ttlSeconds);
    } else {
      memSet(key, value, ttlSeconds);
    }
  } catch {
    // Cache write failure → swallow, return value anyway
  }

  return value;
}

/** TTL constants in seconds */
export const TTL = {
  LIVE_SCORE: 60,
  ROSTER: 5 * 60,
  STANDINGS: 15 * 60,
  LEAGUE_META: 60 * 60,
  HISTORICAL: 24 * 60 * 60,
} as const;
