// ─── Start/Sit verdict log ────────────────────────────────────────────────────
// Every UNIQUE start/sit verdict (one per cache key, not per view) is appended
// here so a future scorer can grade Coach's calls after the week's games
// finish: fetch the roster for that week, compare the two players' actual
// points, and the pick either outscored or it didn't. That produces the
// honest "Coach is 14-9 this season" record (docs/AI_COACH_PLAN.md #2).
// KV-only by design; in dev (no KV) logging is a silent no-op.

export type StartSitVerdictRecord = {
  /** Cache hash of the verdict — dedupe key for the scorer. */
  hash: string;
  /** Credentials owner for the scoring-time roster fetch (Yahoo needs them). */
  userId: string;
  platform: "yahoo" | "sleeper" | "espn";
  leagueKey: string;
  teamKey: string;
  season: number;
  week: number;
  pick: string;
  other: string;
  lean: "strong" | "moderate" | "coin flip";
  ts: number;
  /** Filled in by the scorer after finals; absent until then. */
  result?: { pickPts: number; otherPts: number; correct: boolean };
};

const MAX_LOG_ENTRIES = 2000;

/** Weeks a season's buckets can span (18 regular season + playoff slack). */
const MAX_WEEK = 18;

/**
 * Yahoo API Access and Use Agreement section 3.e: every input entered into an
 * AI tool and every output it returns must be deleted "at reasonable and
 * regular intervals (in no event longer than 30 days)". These records are
 * exactly that: the player names and league/team keys fed to the start/sit
 * advisor, plus its verdict.
 *
 * The log is therefore bucketed per week and each bucket expires 30 days after
 * its first write, rather than being one season-long list capped only by
 * entry count. A season-long list let a week 1 verdict survive into January.
 */
const RETENTION_S = 30 * 24 * 3600;

export function startSitLogKey(season: number, week: number): string {
  return `startsit:log:${season}:w${week}`;
}

/** Fire-and-forget append; failures must never break the verdict response. */
export async function recordStartSitVerdict(rec: StartSitVerdictRecord): Promise<void> {
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@/lib/kv");
    const key = startSitLogKey(rec.season, rec.week);
    const length = await kv.lpush(key, JSON.stringify(rec));
    await kv.ltrim(key, 0, MAX_LOG_ENTRIES - 1);
    // Set the window on creation only. Refreshing it on every write would let
    // the bucket (and its oldest records) outlive the 30-day cap.
    if (length === 1) await kv.expire(key, RETENTION_S);
  } catch (e) {
    console.error("[startsitLog] append failed:", (e as any)?.message || e);
  }
}

/**
 * Every verdict still inside the retention window for a season, newest first.
 * Buckets past 30 days are simply gone, which is the point: a season-long
 * "Coach's record" has to come from aggregate counters that hold no Yahoo
 * Fantasy Information, not from replaying these records.
 */
export async function readStartSitVerdicts(season: number): Promise<StartSitVerdictRecord[]> {
  if (!process.env.KV_REST_API_URL) return [];
  const { kv } = await import("@/lib/kv");
  const buckets = await Promise.all(
    Array.from({ length: MAX_WEEK }, (_, i) =>
      kv
        .lrange<StartSitVerdictRecord>(startSitLogKey(season, i + 1), 0, -1)
        .catch(() => [] as StartSitVerdictRecord[])
    )
  );
  return buckets.flat().filter(Boolean);
}
