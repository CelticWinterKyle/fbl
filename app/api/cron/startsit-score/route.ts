// ─── /api/cron/startsit-score ─────────────────────────────────────────────────
// Vercel Cron (Tuesday mornings ET, after Monday night finishes): grade the
// start/sit calls Coach made, so "Coach is 14-9 this season" is a real record
// rather than a claim.
//
// Two constraints shape this:
//   1. The verdict log is deleted every 30 days (Yahoo agreement 3.e), so
//      grading has to happen while the week is still in the window, and the
//      season record has to live in counters that hold no Yahoo information.
//   2. Those counters are increments, so grading must be idempotent. Every
//      graded verdict is recorded in a parallel set and never counted twice.

import { NextRequest, NextResponse } from "next/server";
import {
  bumpCoachResult,
  markGraded,
  readGradedHashes,
  readWeekVerdicts,
  type StartSitVerdictRecord,
} from "@/lib/startsitLog";
import { getRosterForUser } from "@/lib/rosterData";
import { playerNameKey } from "@/lib/playerName";
import { currentNflSeason } from "@/lib/season";
import { recordCronHeartbeat } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_WEEK = 18;
/** Grade nothing younger than this: the games have to have been played. */
const MIN_AGE_MS = 3 * 24 * 3600 * 1000;
const MAX_GRADES_PER_RUN = 400;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Points for a named player on a team's week roster, or null if not found. */
function pointsFor(players: any[], name: string): number | null {
  const key = playerNameKey(name);
  const hit = players.find((p) => playerNameKey(String(p?.name ?? "")) === key);
  if (!hit) return null;
  const pts = Number(hit.points ?? hit.actual ?? 0);
  return Number.isFinite(pts) ? pts : null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const season = currentNflSeason();
  const now = Date.now();
  let graded = 0;
  let correct = 0;
  let skipped = 0;
  let unresolved = 0;

  // Rosters are per (user, league, team, week); several verdicts in one week
  // usually share one, so fetch each at most once.
  const rosterCache = new Map<string, any[] | null>();

  async function playersFor(v: StartSitVerdictRecord): Promise<any[] | null> {
    const cacheKey = `${v.userId}|${v.platform}|${v.leagueKey}|${v.teamKey}|${v.week}`;
    if (rosterCache.has(cacheKey)) return rosterCache.get(cacheKey) ?? null;

    const res = await getRosterForUser(v.userId, {
      platform: v.platform,
      teamKey: v.teamKey,
      leagueKey: v.leagueKey,
      requestedWeek: String(v.week),
    }).catch(() => null);

    const players = res && (res as any).ok ? ((res as any).players as any[]) : null;
    rosterCache.set(cacheKey, players);
    return players;
  }

  for (let week = 1; week <= MAX_WEEK && graded < MAX_GRADES_PER_RUN; week++) {
    const verdicts = await readWeekVerdicts(season, week);
    if (verdicts.length === 0) continue;

    const already = await readGradedHashes(season, week);

    for (const v of verdicts) {
      if (graded >= MAX_GRADES_PER_RUN) break;
      if (!v?.hash || already.has(v.hash)) continue;
      if (now - Number(v.ts ?? 0) < MIN_AGE_MS) {
        skipped++;
        continue;
      }

      const players = await playersFor(v);
      if (!players) {
        unresolved++;
        continue;
      }

      const pickPts = pointsFor(players, v.pick);
      const otherPts = pointsFor(players, v.other);
      if (pickPts === null || otherPts === null) {
        // A dropped or traded player is gone from the roster. Nothing to grade
        // and nothing to retry, but do not mark it graded: leave it to expire.
        unresolved++;
        continue;
      }
      if (pickPts === 0 && otherPts === 0) {
        // Both blank means the week never actually played out for them.
        skipped++;
        continue;
      }

      const wasCorrect = pickPts > otherPts;
      await bumpCoachResult(season, wasCorrect);
      await markGraded(season, week, v.hash);
      graded++;
      if (wasCorrect) correct++;
    }
  }

  const summary = `graded=${graded} correct=${correct} skipped=${skipped} unresolved=${unresolved}`;
  await recordCronHeartbeat("startsit-score", summary);

  return NextResponse.json({ ok: true, season, graded, correct, skipped, unresolved });
}
