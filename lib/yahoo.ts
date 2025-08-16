import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";

/**
 * Central guard so we can easily short‑circuit Yahoo access when:
 *  - A skip flag is set (SKIP_YAHOO or SKIP_YAHOO_DURING_BUILD)
 *  - Required env vars are missing (client id/secret OR league id)
 *  - No stored OAuth access token yet
 * Returns a structured object so callers can differentiate reasons and
 * avoid noisy stack traces / invalid league key spam in logs.
 */
export type YahooGuard = {
  yf: any | null;
  access: string | null;
  reason: null |
    "skip_flag" |
    "missing_env" |
    "missing_league" |
    "no_token";
};

function shouldSkipYahoo() {
  // Build-time or explicit skip flags
  if (process.env.SKIP_YAHOO === "1" || process.env.SKIP_YAHOO_DURING_BUILD === "1") return true;
  // Next.js during build sets NEXT_PHASE sometimes; also detect lack of server env
  if (process.env.NEXT_PHASE === "phase-production-build" && process.env.SKIP_YAHOO_DURING_BUILD !== "0") return true;
  return false;
}

export async function getYahooAuthed(): Promise<YahooGuard> {
  if (shouldSkipYahoo()) return { yf: null, access: null, reason: "skip_flag" };
  if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
    return { yf: null, access: null, reason: "missing_env" };
  }
  if (!process.env.YAHOO_LEAGUE_ID) {
    // We still authenticate, but callers that need leagueKey should bail early.
    // To keep it simple, mark as missing_league and return null client so they short‑circuit uniformly.
    return { yf: null, access: null, reason: "missing_league" };
  }
  const token = await getValidAccessToken();
  if (!token) return { yf: null, access: null, reason: "no_token" };

  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID,
    process.env.YAHOO_CLIENT_SECRET
  );
  yf.setUserToken(token); // apply OAuth2 bearer token
  return { yf, access: token, reason: null };
}

// Legacy helper (kept for scripts). No guard logic here; caller must ensure env configuration.
export function getYahoo(accessToken: string) {
  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );
  yf.setUserToken(accessToken);
  return yf;
}
