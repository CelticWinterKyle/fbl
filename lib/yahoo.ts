import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";
import { getValidAccessTokenForUser } from "./userTokenStore";

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
  // Only skip when the explicit flag is set.
  // (Removed build-phase heuristic to prevent accidental permanent skip.)
  return process.env.SKIP_YAHOO === "1";
}

export async function getYahooAuthed(): Promise<YahooGuard> {
  if (shouldSkipYahoo()) return { yf: null, access: null, reason: "skip_flag" };
  if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
    return { yf: null, access: null, reason: "missing_env" };
  }
  const token = await getValidAccessToken();
  if (!token) return { yf: null, access: null, reason: "no_token" };

  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID,
    process.env.YAHOO_CLIENT_SECRET
  );
  yf.setUserToken(token); // apply OAuth2 bearer token
  // If league id is missing we still return an authed client so the app can
  // fetch leagues or guide the user to set YAHOO_LEAGUE_ID afterwards.
  const reason: YahooGuard["reason"] = !process.env.YAHOO_LEAGUE_ID ? "missing_league" : null;
  return { yf, access: token, reason };
}

export async function getYahooAuthedForUser(userId: string): Promise<YahooGuard> {
  if (shouldSkipYahoo()) return { yf: null, access: null, reason: "skip_flag" };
  if (!process.env.YAHOO_CLIENT_ID || !process.env.YAHOO_CLIENT_SECRET) {
    return { yf: null, access: null, reason: "missing_env" };
  }
  const token = await getValidAccessTokenForUser(userId);
  if (!token) return { yf: null, access: null, reason: "no_token" };
  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID,
    process.env.YAHOO_CLIENT_SECRET
  );
  yf.setUserToken(token);
  const reason: YahooGuard["reason"] = !process.env.YAHOO_LEAGUE_ID ? "missing_league" : null;
  return { yf, access: token, reason };
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
