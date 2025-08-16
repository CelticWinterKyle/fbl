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
    "no_token";
};

function shouldSkipYahoo() {
  return process.env.SKIP_YAHOO === "1"; // explicit only
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
  yf.setUserToken(token);
  return { yf, access: token, reason: null };
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
