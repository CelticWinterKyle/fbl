// ─── Platform success/error counters ─────────────────────────────────────────
// Tiny KV-backed counters per platform per UTC hour, used by /api/health and
// the /api/cron/alerts heuristic. Keys:
//   metrics:{platform}:{ok|err}:{YYYY-MM-DDTHH}
// Buckets expire after 48h. Everything here is best-effort:
//   - no-op when KV is not configured (dev)
//   - KV failures are swallowed; metrics must NEVER throw or block a hot path.
// Callers should fire-and-forget: void recordPlatformError("yahoo")

export type MetricsPlatform = "yahoo" | "sleeper" | "espn";

const PLATFORMS: MetricsPlatform[] = ["yahoo", "sleeper", "espn"];
const BUCKET_TTL_S = 48 * 3600;

/** UTC hour bucket, e.g. "2026-06-09T14" */
function hourBucket(d: Date = new Date()): string {
  return d.toISOString().slice(0, 13);
}

async function increment(key: string): Promise<void> {
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@vercel/kv");
    await kv.incr(key);
    await kv.expire(key, BUCKET_TTL_S);
  } catch {
    // Metrics are best-effort; never let counter failures surface.
  }
}

export async function recordPlatformError(platform: MetricsPlatform): Promise<void> {
  await increment(`metrics:${platform}:err:${hourBucket()}`);
}

export async function recordPlatformSuccess(platform: MetricsPlatform): Promise<void> {
  await increment(`metrics:${platform}:ok:${hourBucket()}`);
}

export type PlatformStats = Record<MetricsPlatform, { ok: number; err: number }>;

/**
 * Sum ok/err counters per platform across the last `hoursBack` UTC hour
 * buckets (including the current, partial hour). Returns zeros when KV is
 * absent or unreachable.
 */
export async function readPlatformStats(hoursBack: number): Promise<PlatformStats> {
  const stats: PlatformStats = {
    yahoo: { ok: 0, err: 0 },
    sleeper: { ok: 0, err: 0 },
    espn: { ok: 0, err: 0 },
  };
  if (!process.env.KV_REST_API_URL) return stats;

  const hours = Math.max(1, Math.floor(hoursBack));
  const keys: string[] = [];
  const meta: { platform: MetricsPlatform; kind: "ok" | "err" }[] = [];
  for (let i = 0; i < hours; i++) {
    const bucket = hourBucket(new Date(Date.now() - i * 3600_000));
    for (const platform of PLATFORMS) {
      for (const kind of ["ok", "err"] as const) {
        keys.push(`metrics:${platform}:${kind}:${bucket}`);
        meta.push({ platform, kind });
      }
    }
  }

  try {
    const { kv } = await import("@vercel/kv");
    const values = await kv.mget<(number | null)[]>(...keys);
    values.forEach((v, i) => {
      const n = Number(v);
      if (Number.isFinite(n)) stats[meta[i].platform][meta[i].kind] += n;
    });
  } catch {
    // Best-effort read; zeros are an acceptable answer.
  }
  return stats;
}
