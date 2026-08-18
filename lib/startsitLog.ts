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
    // The durable half of the record, which outlives the deletion above.
    await bumpCoachVerdict(rec.season, rec.lean);
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

// ─── Coach's season record ────────────────────────────────────────────────────
//
// The verdict log above is deleted every 30 days under the Yahoo agreement
// (3.e), so a season-long "Coach is 14-9" cannot be computed by replaying it.
// These counters carry the record instead.
//
// They hold NO Yahoo Fantasy Information: no player names, no team keys, no
// league keys, no user ids. Just tallies. That is what makes them safe to keep
// for the season and beyond, and it is the reason the record survives at all.

export type CoachRecord = {
  verdicts: number;
  scored: number;
  correct: number;
  leans: { strong: number; moderate: number; "coin flip": number };
};

const EMPTY_RECORD: CoachRecord = {
  verdicts: 0,
  scored: 0,
  correct: 0,
  leans: { strong: 0, moderate: 0, "coin flip": 0 },
};

export function coachRecordKey(season: number): string {
  return `startsit:record:${season}`;
}

/** Count a verdict as it is issued. Fire-and-forget. */
export async function bumpCoachVerdict(
  season: number,
  lean: StartSitVerdictRecord["lean"]
): Promise<void> {
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@/lib/kv");
    const key = coachRecordKey(season);
    await kv.hincrby(key, "verdicts", 1);
    await kv.hincrby(key, `lean:${lean}`, 1);
  } catch (e) {
    console.error("[startsitLog] record bump failed:", (e as any)?.message || e);
  }
}

/** Count a graded verdict. Called by the scorer once the week's games are final. */
export async function bumpCoachResult(season: number, correct: boolean): Promise<void> {
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@/lib/kv");
    const key = coachRecordKey(season);
    await kv.hincrby(key, "scored", 1);
    if (correct) await kv.hincrby(key, "correct", 1);
  } catch (e) {
    console.error("[startsitLog] result bump failed:", (e as any)?.message || e);
  }
}

export async function readCoachRecord(season: number): Promise<CoachRecord> {
  if (!process.env.KV_REST_API_URL) return EMPTY_RECORD;
  try {
    const { kv } = await import("@/lib/kv");
    const raw = await kv.hgetall<Record<string, string | number>>(coachRecordKey(season));
    if (!raw) return EMPTY_RECORD;
    const n = (k: string) => Number(raw[k] ?? 0) || 0;
    return {
      verdicts: n("verdicts"),
      scored: n("scored"),
      correct: n("correct"),
      leans: {
        strong: n("lean:strong"),
        moderate: n("lean:moderate"),
        "coin flip": n("lean:coin flip"),
      },
    };
  } catch {
    return EMPTY_RECORD;
  }
}

// ─── Grading bookkeeping ──────────────────────────────────────────────────────
//
// The scorer must be idempotent: the counters above are increments, so grading
// the same verdict twice inflates Coach's record permanently. Rather than
// rewriting entries inside the log list (lset by index, fragile), graded
// verdicts are tracked in a parallel set that expires on the same 30-day
// schedule as the bucket it describes.

export function startSitGradedKey(season: number, week: number): string {
  return `startsit:graded:${season}:w${week}`;
}

export async function readGradedHashes(season: number, week: number): Promise<Set<string>> {
  if (!process.env.KV_REST_API_URL) return new Set();
  try {
    const { kv } = await import("@/lib/kv");
    const members = await kv.smembers<string[]>(startSitGradedKey(season, week));
    return new Set(Array.isArray(members) ? members : []);
  } catch {
    return new Set();
  }
}

export async function markGraded(season: number, week: number, hash: string): Promise<void> {
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@/lib/kv");
    const key = startSitGradedKey(season, week);
    const added = await kv.sadd(key, hash);
    if (added === 1) await kv.expire(key, RETENTION_S);
  } catch (e) {
    console.error("[startsitLog] markGraded failed:", (e as any)?.message || e);
  }
}

/** Verdicts still inside the retention window for one week, newest first. */
export async function readWeekVerdicts(
  season: number,
  week: number
): Promise<StartSitVerdictRecord[]> {
  if (!process.env.KV_REST_API_URL) return [];
  try {
    const { kv } = await import("@/lib/kv");
    const raw = await kv.lrange<StartSitVerdictRecord>(startSitLogKey(season, week), 0, -1);
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  } catch {
    return [];
  }
}
