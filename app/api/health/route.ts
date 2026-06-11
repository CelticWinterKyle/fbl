// ─── /api/health ──────────────────────────────────────────────────────────────
// Public health endpoint.
//   Basic (default): env validation + KV round-trip + last-hour platform error
//   counters. Fast (no external network calls). Returns 503 when env or KV is
//   broken so uptime checkers alert.
//   Deep (?deep=1): additionally pings the Sleeper and ESPN public APIs with a
//   5s timeout each. Canary failures mark the response "degraded" but keep
//   HTTP 200 so flaky third-party APIs do not page as our downtime.

import { NextRequest, NextResponse } from "next/server";
import { validateYahooEnvironment } from "@/lib/envCheck";
import { readPlatformStats } from "@/lib/metrics";
import { readCronHeartbeats } from "@/lib/ops";

export const dynamic = "force-dynamic";

const CANARY_TIMEOUT_MS = 5000;

type CheckStatus = "ok" | "error" | "absent";

async function checkKv(): Promise<{ status: CheckStatus; detail?: string }> {
  if (!process.env.KV_REST_API_URL) return { status: "absent" };
  try {
    const { kv } = await import("@vercel/kv");
    // Unique key per check: the long-lived "health:ping" key once got stuck
    // (SET returned OK but the stored value stayed frozen for ~20 minutes
    // while every other key behaved), which false-alarmed the whole site as
    // unhealthy. A fresh key with a short TTL round-trips the real question.
    const ts = Date.now();
    const key = `health:ping:${ts}`;
    const setRes = await kv.set(key, ts, { ex: 120 });
    const raw = await kv.get(key);
    const ok = Number(raw) === ts;
    return ok
      ? { status: "ok" }
      : { status: "error", detail: `set=${String(setRes)} read=${JSON.stringify(raw)} ts=${ts}` };
  } catch (e) {
    console.error("[health] kv check failed:", (e as any)?.message);
    return { status: "error", detail: `threw: ${String((e as any)?.message).slice(0, 120)}` };
  }
}

async function canary(url: string): Promise<"ok" | "error"> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CANARY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get("deep") === "1";

  const envValidation = validateYahooEnvironment();

  const [kvCheck, platformErrorsLastHour, heartbeats] = await Promise.all([
    checkKv(),
    readPlatformStats(1).catch(() => null),
    readCronHeartbeats().catch(() => null),
  ]);

  // Cron liveness: minutes since each job last completed (any outcome,
  // including a skipped run, counts — the question is "is it executing?").
  const crons: Record<string, { lastRun: string; ageMinutes: number; summary: string } | null> = {};
  for (const [name, beat] of Object.entries(heartbeats ?? {})) {
    crons[name] = beat
      ? {
          lastRun: new Date(beat.ts).toISOString(),
          ageMinutes: Math.round((Date.now() - beat.ts) / 60000),
          summary: beat.summary,
        }
      : null;
  }

  const checks: Record<string, unknown> = {
    env: {
      yahoo_configured: envValidation.valid,
      missing_vars: envValidation.missing,
      errors: envValidation.errors,
      kv_available: !!process.env.KV_REST_API_URL,
      skip_yahoo: process.env.SKIP_YAHOO === "1",
    },
    kv: kvCheck.status,
    ...(kvCheck.detail ? { kvDetail: kvCheck.detail } : {}),
    platformErrorsLastHour,
    crons,
  };

  let degraded = false;
  if (deep) {
    const [sleeper, espnPublic] = await Promise.all([
      canary("https://api.sleeper.app/v1/state/nfl"),
      canary("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"),
    ]);
    checks.sleeper = sleeper;
    checks.espnPublic = espnPublic;
    degraded = sleeper === "error" || espnPublic === "error";
  }

  const coreOk = envValidation.valid && kvCheck.status !== "error";

  const body = {
    ok: coreOk,
    status: !coreOk ? "unhealthy" : degraded ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    checks,
  };

  // Canary (deep) failures stay HTTP 200 to avoid uptime-checker noise from
  // third-party hiccups; env/KV breakage is ours and returns 503.
  return NextResponse.json(body, { status: coreOk ? 200 : 503 });
}
