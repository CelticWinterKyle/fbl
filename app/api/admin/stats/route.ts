import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/adminAuth";
import { readPlatformStats } from "@/lib/metrics";
import { readCronHeartbeats, CRON_NAMES } from "@/lib/ops";
import { listPushUsers } from "@/lib/push";
import { listRegisteredLeagues } from "@/lib/leagueRegistry";

export const dynamic = "force-dynamic";

const CRON_STALE_MINUTES: Record<string, number> = {
  "refresh-leagues": 25,
  "espn-keepalive": 1500,
  "alerts": 65,
  "push-dispatch": 15,
};

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  try {
    const clerk = await clerkClient();
    const now = new Date();

    const [
      totalUsers,
      recentSignupsRes,
      pushUsers,
      heartbeats,
      platformStats,
      leagues,
    ] = await Promise.all([
      clerk.users.getCount(),
      clerk.users.getUserList({
        limit: 1,
        createdAtAfter: now.getTime() - 7 * 24 * 3600_000,
      }).then((r) => r.totalCount),
      listPushUsers(),
      readCronHeartbeats().catch(() => null),
      readPlatformStats(24).catch(() => null),
      listRegisteredLeagues(),
    ]);

    const platformBreakdown = { yahoo: 0, sleeper: 0, espn: 0 };
    for (const l of leagues) {
      if (l.platform in platformBreakdown) {
        platformBreakdown[l.platform as keyof typeof platformBreakdown]++;
      }
    }

    // AI budget: read last 7 days without incrementing
    const aiDays: { date: string; spent: number }[] = [];
    let todaySpent = 0;
    let aiLimit = 2_000_000;
    const envLimit = Number(process.env.OPENAI_DAILY_TOKEN_BUDGET);
    if (Number.isFinite(envLimit) && envLimit > 0) aiLimit = envLimit;

    if (process.env.KV_REST_API_URL) {
      try {
        const { kv } = await import("@vercel/kv");
        const keys: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(now.getTime() - i * 24 * 3600_000);
          keys.push(`openai:spend:${d.toISOString().slice(0, 10)}`);
        }
        const vals = await kv.mget<(number | null)[]>(...keys);
        for (let i = 0; i < keys.length; i++) {
          const date = keys[i].replace("openai:spend:", "");
          const spent = vals[i] ?? 0;
          aiDays.push({ date, spent });
          if (i === 0) todaySpent = spent;
        }
      } catch {}
    }

    // Odds opens: last 7 days
    let oddsOpensToday = 0;
    let oddsOpens7d = 0;
    if (process.env.KV_REST_API_URL) {
      try {
        const { kv } = await import("@vercel/kv");
        const keys: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date(now.getTime() - i * 24 * 3600_000);
          keys.push(`odds:opens:${d.toISOString().slice(0, 10)}`);
        }
        const vals = await kv.mget<(number | null)[]>(...keys);
        for (let i = 0; i < vals.length; i++) {
          const v = vals[i] ?? 0;
          if (i === 0) oddsOpensToday = v;
          oddsOpens7d += v;
        }
      } catch {}
    }

    // Crons
    const crons: Record<string, any> = {};
    for (const name of CRON_NAMES) {
      const beat = heartbeats?.[name] ?? null;
      if (beat) {
        const ageMinutes = Math.round((Date.now() - beat.ts) / 60_000);
        crons[name] = {
          lastRun: new Date(beat.ts).toISOString(),
          ageMinutes,
          summary: beat.summary,
          stale: ageMinutes > (CRON_STALE_MINUTES[name] ?? 60),
        };
      } else {
        crons[name] = null;
      }
    }

    // Platform stats with error rates
    const platformStatsOut: Record<string, any> = {};
    if (platformStats) {
      for (const [p, s] of Object.entries(platformStats)) {
        const total = s.ok + s.err;
        platformStatsOut[p] = {
          ok: s.ok,
          err: s.err,
          errorRate: total > 0 ? Math.round((s.err / total) * 100) : 0,
        };
      }
    }

    // KV health
    let kvHealthy = false;
    if (process.env.KV_REST_API_URL) {
      try {
        const { kv } = await import("@vercel/kv");
        const ts = Date.now();
        await kv.set(`health:admin:${ts}`, ts, { ex: 60 });
        kvHealthy = true;
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      overview: {
        totalUsers,
        recentSignups: recentSignupsRes,
        pushSubscribers: pushUsers.length,
        oddsOpensToday,
        oddsOpens7d,
        registeredLeagues: leagues.length,
        platformBreakdown,
      },
      system: { crons, platformStats: platformStatsOut, kvHealthy },
      ai: {
        today: {
          spent: todaySpent,
          limit: aiLimit,
          pct: aiLimit > 0 ? Math.round((todaySpent / aiLimit) * 100) : 0,
        },
        last7: aiDays,
      },
      generatedAt: now.toISOString(),
    });
  } catch (e: any) {
    console.error("[admin/stats]", e?.message || e);
    return NextResponse.json({ ok: false, error: "stats_failed" }, { status: 500 });
  }
}
