// ─── Read-through cache with single-flight + stale-while-revalidate ──────────
//
// Values are stored in an envelope { __swr: 1, v, e } where `e` is the logical
// expiry. The physical KV TTL extends past `e` so an expired-but-present value
// can be served immediately while ONE caller refreshes it:
//   - in-process map dedupes concurrent fetches within a serverless instance
//   - a KV NX lock dedupes across instances
// This kills the hot-key stampede (every in-flight request firing the upstream
// fetch the moment a 60s live-score key expires) that would otherwise burn
// Yahoo/ESPN rate limits on Sunday afternoons.
//
// Legacy raw (non-envelope) values read as stale: served once, then rewritten
// in envelope form by the triggered refresh.

type Envelope<T> = { __swr: 1; v: T; e: number };

function isEnvelope<T>(x: unknown): x is Envelope<T> {
  return !!x && typeof x === "object" && (x as any).__swr === 1 && "v" in (x as any);
}

// How long past logical expiry a stale value remains servable.
function staleGraceSeconds(ttlSeconds: number): number {
  return Math.min(ttlSeconds * 4, 3600);
}

// ─── In-process cache (dev) + single-flight map ───────────────────────────────

const memCache = new Map<string, Envelope<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

// ─── KV helpers ──────────────────────────────────────────────────────────────

function isKvAvailable(): boolean {
  return !!process.env.KV_REST_API_URL;
}

async function readEnvelope<T>(key: string): Promise<Envelope<T> | null> {
  let raw: unknown = null;
  if (isKvAvailable()) {
    const { kv } = await import("@/lib/kv");
    raw = await kv.get(key);
  } else {
    raw = memCache.get(key) ?? null;
  }
  if (raw === null || raw === undefined) return null;
  if (isEnvelope<T>(raw)) return raw;
  // Legacy raw value: treat as already-stale so it serves once and refreshes.
  return { __swr: 1, v: raw as T, e: 0 };
}

async function writeEnvelope<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const env: Envelope<T> = { __swr: 1, v: value, e: Date.now() + ttlSeconds * 1000 };
  if (isKvAvailable()) {
    const { kv } = await import("@/lib/kv");
    await kv.set(key, env, { ex: ttlSeconds + staleGraceSeconds(ttlSeconds) });
  } else {
    memCache.set(key, env);
  }
}

async function tryLock(key: string): Promise<boolean> {
  if (!isKvAvailable()) return true; // dev: in-process map is enough
  try {
    const { kv } = await import("@/lib/kv");
    const res = await kv.set(`lock:cache:${key}`, "1", { nx: true, ex: 30 });
    return res === "OK";
  } catch {
    return true; // lock infra failure: fetch anyway rather than fail the read
  }
}

async function unlock(key: string): Promise<void> {
  if (!isKvAvailable()) return;
  try {
    const { kv } = await import("@/lib/kv");
    await kv.del(`lock:cache:${key}`);
  } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Read-through cache. Calls fetcher on miss; stores result for ttlSeconds.
 * Serves stale values (up to a grace window) while a single caller refreshes.
 * In production (KV available): Vercel KV. In development: in-process memory.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  let ent: Envelope<T> | null = null;
  try {
    ent = await readEnvelope<T>(key);
    if (ent && Date.now() < ent.e) return ent.v; // fresh
  } catch {
    // Cache read failure → proceed to fetcher
  }

  // Stale or missing: single-flight within this instance.
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return ent ? ent.v : existing;

  const p = (async (): Promise<T> => {
    const haveStale = !!ent;
    const locked = await tryLock(key);
    if (!locked) {
      if (ent) return ent.v; // another instance is refreshing; serve stale
      // Cold key, lost the lock: give the winner a moment, then re-read.
      await new Promise((r) => setTimeout(r, 1200));
      try {
        const refreshed = await readEnvelope<T>(key);
        if (refreshed) return refreshed.v;
      } catch {}
      // Winner failed or is slow: fall through and fetch ourselves.
    }
    try {
      const value = await fetcher();
      try {
        await writeEnvelope(key, value, ttlSeconds);
      } catch {
        // Cache write failure → swallow, return value anyway
      }
      return value;
    } catch (e) {
      // Fetcher failed: a stale value beats an error for the reader.
      if (haveStale && ent) return ent.v;
      throw e;
    } finally {
      if (locked) await unlock(key);
    }
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/**
 * Force-refresh a key (used by the snapshot cron): always runs the fetcher and
 * rewrites the envelope, so user requests inside the TTL window are pure reads.
 */
export async function refreshCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const value = await fetcher();
  await writeEnvelope(key, value, ttlSeconds);
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
