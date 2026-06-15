// ─── Operational plumbing: cron heartbeats + critical-error alerts ───────────
// Heartbeats: every cron records {ts, summary} on completion so /api/health
// can show which background jobs are alive (a silently dead cron was
// previously invisible). Critical errors: one-line reporter that posts to
// ALERT_WEBHOOK_URL (Discord-compatible) with a per-tag hourly dedupe, so a
// crash loop pages once instead of sixty times. Without the webhook it
// degrades to console.error (current behavior).

export const CRON_NAMES = [
  "refresh-leagues",
  "espn-keepalive",
  "alerts",
  "push-dispatch",
] as const;
export type CronName = (typeof CRON_NAMES)[number];

export type Heartbeat = { ts: number; summary: string };

function kvReady(): boolean {
  return !!process.env.KV_REST_API_URL;
}

/** Record that a cron completed (best-effort; never throws). */
export async function recordCronHeartbeat(name: CronName, summary: string): Promise<void> {
  if (!kvReady()) return;
  try {
    const { kv } = await import("@vercel/kv");
    const beat: Heartbeat = { ts: Date.now(), summary: summary.slice(0, 200) };
    await kv.set(`cron:lastrun:${name}`, beat, { ex: 30 * 24 * 3600 });
  } catch {
    // Observability must never break the job it observes.
  }
}

export async function readCronHeartbeats(): Promise<Record<string, Heartbeat | null>> {
  const out: Record<string, Heartbeat | null> = {};
  if (!kvReady()) {
    for (const name of CRON_NAMES) out[name] = null;
    return out;
  }
  try {
    const { kv } = await import("@vercel/kv");
    const beats = await Promise.all(
      CRON_NAMES.map((name) => kv.get<Heartbeat>(`cron:lastrun:${name}`))
    );
    CRON_NAMES.forEach((name, i) => {
      out[name] = beats[i] ?? null;
    });
  } catch {
    for (const name of CRON_NAMES) out[name] = null;
  }
  return out;
}

/**
 * Post a non-critical notice to Discord. No dedupe (every call sends).
 * Falls back to console.log when ALERT_WEBHOOK_URL is unset. Never throws.
 */
export async function notifyDiscord(message: string): Promise<void> {
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) {
    console.log("[notify] suppressed (no webhook configured)");
    return;
  }
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message.slice(0, 1500), allowed_mentions: { parse: [] } }),
    });
  } catch (e: any) {
    console.error(`[notify] webhook delivery failed: ${e?.message}`);
  }
}

/**
 * Report a critical error: Discord webhook when configured (deduped to one
 * alert per tag per hour), console.error always. Fire-and-forget safe.
 */
export async function reportCriticalError(tag: string, message: string): Promise<void> {
  const line = `[${tag}] ${message}`.slice(0, 1500);
  console.error(`[critical] ${line}`);

  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return;

  // One page per tag per hour.
  if (kvReady()) {
    try {
      const { kv } = await import("@vercel/kv");
      const hour = new Date().toISOString().slice(0, 13);
      const claimed = await kv.set(`alert:err:${tag}:${hour}`, 1, { nx: true, ex: 2 * 3600 });
      if (claimed !== "OK") return;
    } catch {
      // Dedupe failure: better a duplicate page than silence.
    }
  }

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `League Blitz critical: ${line}`, allowed_mentions: { parse: [] } }),
    });
  } catch (e: any) {
    console.error(`[critical] webhook delivery failed: ${e?.message}`);
  }
}
