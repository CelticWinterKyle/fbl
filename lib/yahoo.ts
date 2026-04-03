import YahooFantasy from "yahoo-fantasy";
import { getValidAccessTokenForUser } from "./tokenStore/index";

// Environment validation
function validateEnvironment() {
  const required = ['YAHOO_CLIENT_ID', 'YAHOO_CLIENT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
}

export type YahooGuard = {
  yf: any | null;
  access: string | null;
  reason: null |
    "skip_flag" |
    "missing_env" |
    "no_token" |
    "env_validation_failed";
};

function shouldSkipYahoo() {
  return process.env.SKIP_YAHOO === "1";
}

// Deprecated: use getYahooAuthedForUser(userId) instead.
// Global token concept is removed; this always returns no_token.
export async function getYahooAuthed(): Promise<YahooGuard> {
  return { yf: null, access: null, reason: "no_token" };
}

export async function getYahooAuthedForUser(userId: string): Promise<YahooGuard> {
  if (shouldSkipYahoo()) return { yf: null, access: null, reason: "skip_flag" };
  
  if (!validateEnvironment()) {
    return { yf: null, access: null, reason: "env_validation_failed" };
  }
  
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

export function getYahoo(accessToken: string) {
  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );
  yf.setUserToken(accessToken);
  return yf;
}

const TEAM_KEY_RE = /^(\d+)\.l\.(\d+)\.t\.(\d+)$/;
export function leagueKeyFromTeamKey(teamKey: string | null | undefined): string | null {
  if (!teamKey || typeof teamKey !== 'string') {
    return null;
  }
  const m = TEAM_KEY_RE.exec(teamKey);
  return m ? `${m[1]}.l.${m[2]}` : null;
}

