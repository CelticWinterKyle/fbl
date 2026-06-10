/**
 * Hard production-environment assertions. Called from middleware module scope,
 * so a misconfigured prod deploy fails loudly on the first request instead of
 * silently degrading (plaintext credential storage, no-op persistence, open
 * rate limits).
 *
 * Only env-var checks live here: middleware runs on the edge runtime, so no
 * node imports.
 */
export function assertProdEnv(): void {
  // Only enforce on Vercel at runtime. GitHub CI builds with
  // NODE_ENV=production but no Vercel env; local dev is unaffected.
  if (!process.env.VERCEL || process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (!process.env.KV_REST_API_URL) missing.push("KV_REST_API_URL");
  if (!process.env.KV_REST_API_TOKEN) missing.push("KV_REST_API_TOKEN");

  if (missing.length > 0) {
    throw new Error(
      `FATAL: required production env vars missing: ${missing.join(", ")}. ` +
        "Without these the app silently stores credentials unencrypted and persists nothing. Refusing to serve."
    );
  }
}
