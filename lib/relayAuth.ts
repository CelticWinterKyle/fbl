// Shared HMAC verification for browser extension relay requests.
// Token format: "{userId}:{timestamp}:{hmac}"
// Clerk userIds are "user_XXXX" — no colons — so splitting on the last two colons is safe.

import crypto from "crypto";

const TOKEN_TTL_S = 86400; // 24 hours

export function verifyRelayToken(token: string | null): string | null {
  if (!token) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  const parts = token.split(":");
  if (parts.length !== 3) return null;

  const [userId, tsStr, hmac] = parts;
  const timestamp = parseInt(tsStr, 10);
  if (!userId || isNaN(timestamp) || !hmac) return null;

  // Reject expired tokens
  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > TOKEN_TTL_S) return null;

  // Reject tokens from the future (clock skew tolerance: 60s)
  if (timestamp > now + 60) return null;

  // Constant-time HMAC comparison
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${timestamp}`)
    .digest("hex");

  try {
    if (!crypto.timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"))) {
      return null;
    }
  } catch {
    return null; // invalid hex in hmac field
  }

  return userId;
}
