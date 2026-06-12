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

export function startSitLogKey(season: number): string {
  return `startsit:log:${season}`;
}

/** Fire-and-forget append; failures must never break the verdict response. */
export async function recordStartSitVerdict(rec: StartSitVerdictRecord): Promise<void> {
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@vercel/kv");
    const key = startSitLogKey(rec.season);
    await kv.lpush(key, JSON.stringify(rec));
    await kv.ltrim(key, 0, MAX_LOG_ENTRIES - 1);
  } catch (e) {
    console.error("[startsitLog] append failed:", (e as any)?.message || e);
  }
}
