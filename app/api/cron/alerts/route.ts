// ─── /api/cron/alerts ─────────────────────────────────────────────────────────
// Vercel Cron (every 30 min): inspects the last hour of platform success/error
// counters and fires an alert for any platform that is mostly failing
// (err >= 10 AND err > ok). Alerts post to ALERT_WEBHOOK_URL when set
// (Discord-compatible JSON: { content }), otherwise console.error.
// A KV dedupe key (alert:sent:{platform}:{hour}) caps it at one alert per
// platform per UTC hour.
//
// Auth: Vercel sends "Authorization: Bearer ${CRON_SECRET}" when the env var is
// set on the project. Requests without it are rejected.

import { NextRequest, NextResponse } from "next/server";
import { readPlatformStats, type MetricsPlatform } from "@/lib/metrics";
import { recordCronHeartbeat, readCronHeartbeats } from "@/lib/ops";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS: MetricsPlatform[] = ["yahoo", "sleeper", "espn"];
const ERROR_THRESHOLD = 10;
const ESPN_ALERTS_MUTED_UNTIL = new Date("2026-07-15T00:00:00Z");

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Returns true if this alert slot has NOT been claimed yet this hour (and marks it). */
async function claimAlertSlot(platform: string, hour: string): Promise<boolean> {
  if (!process.env.KV_REST_API_URL) return true; // no KV: best-effort, no dedupe
  try {
    const { kv } = await import("@vercel/kv");
    const res = await kv.set(`alert:sent:${platform}:${hour}`, 1, { nx: true, ex: 2 * 3600 });
    return res === "OK";
  } catch {
    return true; // dedupe infra failure: better a duplicate alert than none
  }
}

async function sendAlert(content: string): Promise<void> {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) {
    console.error(`[cron/alerts] ${content}`);
    return;
  }
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      console.error(`[cron/alerts] webhook returned ${res.status}; alert was: ${content}`);
    }
  } catch (e: any) {
    console.error(`[cron/alerts] webhook delivery failed: ${e?.message}; alert was: ${content}`);
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const stats = await readPlatformStats(1);
  const now = new Date();
  const hour = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH (UTC)
  const alerted: string[] = [];
  const skipped: string[] = [];

  const platforms = now < ESPN_ALERTS_MUTED_UNTIL
    ? ALL_PLATFORMS.filter((p) => p !== "espn")
    : ALL_PLATFORMS;

  for (const platform of platforms) {
    const { ok, err } = stats[platform];
    if (err < ERROR_THRESHOLD || err <= ok) continue;

    if (!(await claimAlertSlot(platform, hour))) {
      skipped.push(platform);
      continue;
    }

    await sendAlert(
      `FBL alert: ${platform} requests are mostly failing over the last hour (errors: ${err}, successes: ${ok}).`
    );
    alerted.push(platform);
  }

  // ── Dead-cron watchdog ──
  // A cron that stops completing leaves a stale heartbeat; page once per
  // hour. Null heartbeats are skipped (pre-first-run after a deploy). This
  // cron can't watch itself — point an external uptime monitor at
  // /api/health for that.
  const STALE_THRESHOLD_MIN: Record<string, number> = {
    "refresh-leagues": 40, // runs every 10 min
    "push-dispatch": 25, // runs every 5 min
    "espn-keepalive": 26 * 60, // nightly
  };
  const beats = await readCronHeartbeats();
  for (const [name, maxAge] of Object.entries(STALE_THRESHOLD_MIN)) {
    const beat = beats[name];
    if (!beat) continue;
    const ageMin = Math.round((Date.now() - beat.ts) / 60000);
    if (ageMin <= maxAge) continue;
    if (!(await claimAlertSlot(`cron-${name}`, hour))) {
      skipped.push(`cron-${name}`);
      continue;
    }
    await sendAlert(
      `League Blitz alert: cron ${name} has not completed in ${ageMin} minutes (expected within ${maxAge}).`
    );
    alerted.push(`cron-${name}`);
  }

  await recordCronHeartbeat("alerts", `alerted=${alerted} skipped=${skipped}`);
  return NextResponse.json({ ok: true, hour, alerted, skipped, stats });
}
