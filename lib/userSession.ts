import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const USER_COOKIE = "fbl_uid";

export function generateUserId() {
  return crypto.randomBytes(10).toString("hex");
}

export function getUserId(req: NextRequest): string | null {
  const cookie = req.cookies.get(USER_COOKIE);
  return cookie?.value || null;
}

export function getOrCreateUserId(req: NextRequest, res?: NextResponse) {
  let uid = getUserId(req);
  let created = false;
  
  // Log for debugging
  console.log(`[Session] Current userId from cookie: ${uid ? uid.slice(0,8) + '...' : 'none'}`);
  
  if (!uid) {
    uid = generateUserId();
    created = true;
    console.log(`[Session] Created new userId: ${uid.slice(0,8)}...`);
    
    if (res) {
      res.cookies.set({
        name: USER_COOKIE,
        value: uid,
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });
    }
  }
  return { userId: uid!, created };
}

export function makeState(userId: string, secret: string) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const sig = crypto.createHmac("sha256", secret).update(userId + "." + nonce).digest("hex");
  const payload = { u: userId, n: nonce, s: sig };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function parseAndVerifyState(state: string | null, secret: string): { ok: boolean; userId?: string; error?: string } {
  if (!state) return { ok: false, error: "missing_state" };
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const { u, n, s } = decoded || {};
    if (!u || !n || !s) return { ok: false, error: "invalid_state_shape" };
    const expected = crypto.createHmac("sha256", secret).update(u + "." + n).digest("hex");
    if (expected !== s) return { ok: false, error: "bad_state_sig" };
    return { ok: true, userId: u };
  } catch {
    return { ok: false, error: "state_parse_error" };
  }
}
