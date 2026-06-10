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

export const dynamic = "force-dynamic";

const CANARY_TIMEOUT_MS = 5000;

type CheckStatus = "ok" | "error" | "absent";

async function checkKv(): Promise<CheckStatus> {
  if (!process.env.KV_REST_API_URL) return "absent";
  try {
    const { kv } = await import("@vercel/kv");
    const ts = Date.now();
    await kv.set("health:ping", ts, { ex: 60 });
    const read = await kv.get("health:ping");
    return Number(read) === ts ? "ok" : "error";
  } catch {
    return "error";
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

  const [kvStatus, platformErrorsLastHour] = await Promise.all([
    checkKv(),
    readPlatformStats(1).catch(() => null),
  ]);

  const checks: Record<string, unknown> = {
    env: {
      yahoo_configured: envValidation.valid,
      missing_vars: envValidation.missing,
      errors: envValidation.errors,
      kv_available: !!process.env.KV_REST_API_URL,
      skip_yahoo: process.env.SKIP_YAHOO === "1",
    },
    kv: kvStatus,
    platformErrorsLastHour,
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

  const coreOk = envValidation.valid && kvStatus !== "error";

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
