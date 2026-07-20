import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { startSitLogKey, type StartSitVerdictRecord } from "@/lib/startsitLog";
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

    if (process.env.KV_REST_API_URL) {
      const { kv } = await import("@/lib/kv");
      const raw = await kv.lrange<StartSitVerdictRecord>(startSitLogKey(season), 0, -1);
      verdicts = Array.isArray(raw) ? raw : [];
    }

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

    return NextResponse.json({
      ok: true,
      season,
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
