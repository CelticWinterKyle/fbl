// Shared HMAC verification for browser extension / bookmarklet relay requests.
//
// Token format (v2): "{userId}:{ver}:{timestamp}:{hmac}"
// Clerk userIds are "user_XXXX" — no colons — so splitting on colons is safe.
//
// - 2h TTL: long enough for the drag-bookmarklet-then-click flow and for the
//   extension's hourly sync (which re-mints via /api/espn/relay-token), short
//   enough that a leaked token (e.g. via bookmark sync) ages out fast.
// - ver is a per-user revocation counter stored in KV. Bumping it invalidates
//   every outstanding token for that user instantly.
// - Verification also reports token age so endpoints can require a *fresh*
//   token for higher-trust actions (creating connections) while accepting any
//   valid token for lower-trust ones (refreshing existing creds).

import crypto from "crypto";

export const TOKEN_TTL_S = 7200; // 2 hours
export const FRESH_TOKEN_MAX_AGE_S = 900; // 15 min: connection-creating actions

async function getRelayTokenVersion(userId: string): Promise<number> {
  if (!process.env.KV_REST_API_URL) return 1; // dev: no revocation store
  try {
    const { kv } = await import("@/lib/kv");
    return (await kv.get<number>(`relaytok:ver:${userId}`)) ?? 1;
  } catch {
    return 1;
  }
}

/** Invalidate every outstanding relay token for this user. */
export async function bumpRelayTokenVersion(userId: string): Promise<void> {
  if (!process.env.KV_REST_API_URL) return;
  try {
    const { kv } = await import("@/lib/kv");
    await kv.incr(`relaytok:ver:${userId}`);
  } catch {}
}

export async function signRelayToken(userId: string, secret: string): Promise<string> {
  const ver = await getRelayTokenVersion(userId);
  const timestamp = Math.floor(Date.now() / 1000);
  const hmac = crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${ver}:${timestamp}`)
    .digest("hex");
  return `${userId}:${ver}:${timestamp}:${hmac}`;
}

export type RelayTokenResult = { userId: string; ageS: number };

export async function verifyRelayToken(token: string | null): Promise<RelayTokenResult | null> {
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const parts = token.split(":");
  if (parts.length !== 4) return null;

  const [userId, verStr, tsStr, hmac] = parts;
  const ver = parseInt(verStr, 10);
  const timestamp = parseInt(tsStr, 10);
  if (!userId || isNaN(ver) || isNaN(timestamp) || !hmac) return null;

  const now = Math.floor(Date.now() / 1000);
  // Reject expired tokens
  if (now - timestamp > TOKEN_TTL_S) return null;
  // Reject tokens from the future (clock skew tolerance: 60s)
  if (timestamp > now + 60) return null;

  // Constant-time HMAC comparison
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${ver}:${timestamp}`)
    .digest("hex");

  try {
    if (!crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"))) {
      return null;
    }
  } catch {
    return null; // invalid hex in hmac field
  }

  // Revocation check after the cheap checks pass (one KV read)
  const currentVer = await getRelayTokenVersion(userId);
  if (ver !== currentVer) return null;

  return { userId, ageS: Math.max(0, now - timestamp) };
}
