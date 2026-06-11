// ─── Web Push: subscriptions, preferences, send pipeline ─────────────────────
// docs/PUSH_NOTIFICATIONS.md. Storage mirrors lib/tokenStore: KV in prod
// (push:subs:{userId}, push:prefs:{userId}, registry set push:users), files
// under lib/yahoo-users/ in dev. Sends use the web-push package with VAPID
// keys; dead subscriptions (404/410 from the push service) are pruned on send.
//
// BRIGHT LINE (docs/ODDS_MONETIZATION_PLAN.md): no odds, lines, or promo
// content in notifications, ever. Notification types are game events only.

import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** Coarse device hint for the settings UI ("iPhone", "Mac", ...) */
  device?: string;
  addedAt: number;
};

export type PushPrefs = {
  /** Your rostered player scored a touchdown */
  td: boolean;
  /** One of your matchups is within one score in the 4th quarter */
  closeGame: boolean;
  /** Final score recap per league */
  final: boolean;
  /** An inactive (out/IR/doubtful/bye) player is still in your starting lineup */
  lineup: boolean;
};

/** Default: lineup + TD + final; close-game stays opt-in (fatigue). */
export const DEFAULT_PUSH_PREFS: PushPrefs = {
  td: true,
  closeGame: false,
  final: true,
  lineup: true,
};

export type PushPayload = {
  title: string;
  body: string;
  /** Path to open when the notification is tapped (e.g. "/gameday") */
  url?: string;
  /** Collapse key: a newer notification with the same tag replaces the older */
  tag?: string;
};

// ─── Storage plumbing (mirrors tokenStore) ────────────────────────────────────

function isKvAvailable(): boolean {
  return !!process.env.KV_REST_API_URL;
}

function getUserDir(): string {
  const dir = path.join(process.cwd(), "lib", "yahoo-users");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const subsKey = (userId: string) => `push:subs:${userId}`;
const prefsKey = (userId: string) => `push:prefs:${userId}`;
const USERS_SET = "push:users";

const subsFile = (userId: string) => path.join(getUserDir(), `${userId}.push.json`);
const prefsFile = (userId: string) => path.join(getUserDir(), `${userId}.pushprefs.json`);

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function readPushSubs(userId: string): Promise<PushSubscriptionRecord[]> {
  if (isKvAvailable()) {
    const { kv } = await import("@vercel/kv");
    const subs = await kv.get<PushSubscriptionRecord[]>(subsKey(userId));
    return Array.isArray(subs) ? subs : [];
  }
  try {
    return JSON.parse(fs.readFileSync(subsFile(userId), "utf8"));
  } catch {
    return [];
  }
}

async function writePushSubs(userId: string, subs: PushSubscriptionRecord[]): Promise<void> {
  if (isKvAvailable()) {
    const { kv } = await import("@vercel/kv");
    if (subs.length === 0) {
      await kv.del(subsKey(userId));
      await kv.srem(USERS_SET, userId);
    } else {
      await kv.set(subsKey(userId), subs);
      await kv.sadd(USERS_SET, userId);
    }
    return;
  }
  if (subs.length === 0) {
    try { fs.unlinkSync(subsFile(userId)); } catch { /* already gone */ }
  } else {
    fs.writeFileSync(subsFile(userId), JSON.stringify(subs, null, 2));
  }
}

export async function addPushSub(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  device?: string
): Promise<void> {
  const subs = await readPushSubs(userId);
  const next = subs.filter((s) => s.endpoint !== sub.endpoint);
  next.push({ endpoint: sub.endpoint, keys: sub.keys, device, addedAt: Date.now() });
  await writePushSubs(userId, next);
}

export async function removePushSub(userId: string, endpoint: string): Promise<void> {
  const subs = await readPushSubs(userId);
  await writePushSubs(userId, subs.filter((s) => s.endpoint !== endpoint));
}

/** Every user with at least one subscription — the cron fan-out list. */
export async function listPushUsers(): Promise<string[]> {
  if (isKvAvailable()) {
    const { kv } = await import("@vercel/kv");
    const members = await kv.smembers(USERS_SET);
    return Array.isArray(members) ? (members as string[]) : [];
  }
  try {
    return fs
      .readdirSync(getUserDir())
      .filter((f) => f.endsWith(".push.json"))
      .map((f) => f.slice(0, -".push.json".length));
  } catch {
    return [];
  }
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export async function readPushPrefs(userId: string): Promise<PushPrefs> {
  let stored: Partial<PushPrefs> | null = null;
  if (isKvAvailable()) {
    const { kv } = await import("@vercel/kv");
    stored = await kv.get<PushPrefs>(prefsKey(userId));
  } else {
    try {
      stored = JSON.parse(fs.readFileSync(prefsFile(userId), "utf8"));
    } catch {
      stored = null;
    }
  }
  return { ...DEFAULT_PUSH_PREFS, ...(stored ?? {}) };
}

export async function savePushPrefs(userId: string, prefs: PushPrefs): Promise<void> {
  const clean: PushPrefs = {
    td: prefs.td === true,
    closeGame: prefs.closeGame === true,
    final: prefs.final === true,
    lineup: prefs.lineup === true,
  };
  if (isKvAvailable()) {
    const { kv } = await import("@vercel/kv");
    await kv.set(prefsKey(userId), clean);
  } else {
    fs.writeFileSync(prefsFile(userId), JSON.stringify(clean, null, 2));
  }
}

// ─── Send ─────────────────────────────────────────────────────────────────────

let vapidConfigured = false;

async function getWebPush() {
  const webpush = (await import("web-push")).default;
  if (!vapidConfigured) {
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return null;
    webpush.setVapidDetails("mailto:leagueblitz@celticwinter.com", pub, priv);
    vapidConfigured = true;
  }
  return webpush;
}

export function isPushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Send one payload to every device a user has subscribed. Dead subscriptions
 * (push service answers 404/410) are pruned. Never throws: push is
 * best-effort and must not break the calling cron.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  const result = { sent: 0, pruned: 0 };
  try {
    const webpush = await getWebPush();
    if (!webpush) return result;
    const subs = await readPushSubs(userId);
    if (subs.length === 0) return result;

    const body = JSON.stringify(payload);
    const dead: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            body,
            { TTL: 60 * 30 } // game events are stale after ~30 minutes
          );
          result.sent += 1;
        } catch (e: any) {
          const status = e?.statusCode;
          if (status === 404 || status === 410) dead.push(sub.endpoint);
        }
      })
    );

    if (dead.length > 0) {
      const remaining = subs.filter((s) => !dead.includes(s.endpoint));
      await writePushSubs(userId, remaining);
      result.pruned = dead.length;
    }
  } catch (e: any) {
    console.error("[push] send failed:", e?.message);
  }
  return result;
}
