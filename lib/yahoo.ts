import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";
import { getValidAccessTokenForUser } from "./userTokenStore";

/**
 * Central guard so we can easily short‑circuit Yahoo access when:
 *  - Explicit skip flag is set (SKIP_YAHOO === '1')
 *  - Required client credentials missing
 *  - No stored OAuth access token yet
 * NOTE: We deliberately do NOT require a league id here; callers that need a
 * league key will derive it separately. This enables per‑user league listing
 * right after auth without build‑time env coupling.
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

// Fetch the authenticated user's teams for the NFL (or specified game code) using the SDK's user.teams
// and derive league keys from team keys. We intentionally use the string 'nfl' instead of numeric
// game keys so the SDK performs the proper users;use_login=1 traversal.
export async function getUserTeams(game: string = 'nfl'): Promise<{
  ok: boolean;
  reason?: string;
  team_count?: number;
  teams?: any[];
  derived_league_keys?: string[];
}> {
  const { yf, reason } = await getYahooAuthed();
  if (!yf) return { ok: false, reason: reason || undefined };
  try {
    // @ts-ignore sdk method
    const teamsRes: any = await yf.user.teams(game);
    const teamsArr: any[] = Array.isArray(teamsRes) ? teamsRes : teamsRes?.teams || teamsRes?.user?.teams || [];
    const teamKeys: string[] = [];
    for (const t of teamsArr) {
      const key = t?.team_key || t?.team?.team_key || t?.key;
      if (typeof key === 'string') teamKeys.push(key);
    }
    const leagueKeys = Array.from(new Set(teamKeys.map(k => k.includes('.t.') ? k.split('.t.')[0] : null).filter(Boolean) as string[]));
    return { ok: true, team_count: teamKeys.length, teams: teamKeys, derived_league_keys: leagueKeys };
  } catch (e) {
    return { ok: false, reason: 'sdk_error' };
  }
}
