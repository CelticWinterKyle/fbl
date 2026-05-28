import crypto from "crypto";

// ─── Yahoo OAuth state helpers ────────────────────────────────────────────────
// Still used for Yahoo OAuth CSRF protection.
// The userId encoded in state now comes from Clerk (passed in by the login route).

export function makeState(userId: string, secret: string) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const sig = crypto.createHmac("sha256", secret).update(userId + "." + nonce).digest("hex");
  const payload = { u: userId, n: nonce, s: sig };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function parseAndVerifyState(
  state: string | null,
  secret: string
): { ok: boolean; userId?: string; error?: string } {
  if (!state) return { ok: false, error: "missing_state" };
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    const { u, n, s } = decoded || {};
    if (!u || !n || !s) return { ok: false, error: "invalid_state_shape" };
    const expected = crypto
      .createHmac("sha256", secret)
      .update(u + "." + n)
      .digest("hex");
    if (expected !== s) return { ok: false, error: "bad_state_sig" };
    return { ok: true, userId: u };
  } catch {
    return { ok: false, error: "state_parse_error" };
  }
}
