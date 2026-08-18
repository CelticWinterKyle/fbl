import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  readCoachRecord,
  readStartSitVerdicts,
  type StartSitVerdictRecord,
} from "@/lib/startsitLog";
import { currentNflSeason } from "@/lib/season";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const params = req.nextUrl.searchParams;
  const season = Number(params.get("season")) || currentNflSeason();
  const weekFilter = params.get("week") ? Number(params.get("week")) : null;
  const leanFilter = params.get("lean") || null;

  try {
    let verdicts: StartSitVerdictRecord[] = [];

    // Only the last 30 days survive now (Yahoo agreement 3.e); older weeks
    // have expired and cannot be reported on.
    verdicts = await readStartSitVerdicts(season);

    if (weekFilter !== null) {
      verdicts = verdicts.filter((v) => v.week === weekFilter);
    }
    if (leanFilter) {
      verdicts = verdicts.filter((v) => v.lean === leanFilter);
    }

    const leanDist = { strong: 0, moderate: 0, "coin flip": 0 };
    const platformDist = { yahoo: 0, sleeper: 0, espn: 0 };
    let scoredCount = 0;
    let correctCount = 0;

    for (const v of verdicts) {
      if (v.lean in leanDist) leanDist[v.lean as keyof typeof leanDist]++;
      if (v.platform in platformDist) platformDist[v.platform as keyof typeof platformDist]++;
      if (v.result) {
        scoredCount++;
        if (v.result.correct) correctCount++;
      }
    }

    // The durable tally, which survives the 30-day deletion of the verdicts
    // below and is what a public "Coach's record" should ever be built on.
    const record = await readCoachRecord(season);

    return NextResponse.json({
      ok: true,
      season,
      record: {
        ...record,
        accuracy:
          record.scored > 0 ? Math.round((record.correct / record.scored) * 100) : null,
      },
      // Everything below covers only the last 30 days.
      stats: {
        totalVerdicts: verdicts.length,
        leanDistribution: leanDist,
        platformBreakdown: platformDist,
        scoredCount,
        accuracy: scoredCount > 0 ? Math.round((correctCount / scoredCount) * 100) : null,
      },
      verdicts: verdicts.map((v) => ({
        hash: v.hash,
        userId: v.userId.slice(0, 8),
        platform: v.platform,
        week: v.week,
        pick: v.pick,
        other: v.other,
        lean: v.lean,
        ts: v.ts,
        result: v.result ?? null,
      })),
    });
  } catch (e: any) {
    console.error("[admin/coach]", e?.message || e);
    return NextResponse.json({ ok: false, error: "coach_failed" }, { status: 500 });
  }
}
