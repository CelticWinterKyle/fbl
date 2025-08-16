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
/** team_key looks like "461.l.12345.t.7" -> league key "461.l.12345" */
const TEAM_KEY_RE = /^(\d+)\.l\.(\d+)\.t\.(\d+)$/;
export function leagueKeyFromTeamKey(teamKey: string) {
  const m = TEAM_KEY_RE.exec(String(teamKey));
  return m ? `${m[1]}.l.${m[2]}` : null;
}

type TeamLite = { team_key: string; name?: string; league_key: string | null };

function dedupe<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

/** Normalize both SDK and raw REST shapes into TeamLite[] */
function normalizeTeams(data: any): TeamLite[] {
  const out: TeamLite[] = [];
  const pushFrom = (team: any) => {
    const tk = team?.team_key ?? team?.team?.[0]?.team_key?.[0];
    const name = team?.name ?? team?.team?.[0]?.name?.[0];
    if (tk) out.push({ team_key: String(tk), name, league_key: leagueKeyFromTeamKey(String(tk)) });
  };

  // SDK shape: { teams: [...] }
  if (Array.isArray(data?.teams)) {
    data.teams.forEach(pushFrom);
  }

  // REST shape: fantasy_content.users.user[0].games.game[].teams.team[]
  const fc = data?.fantasy_content;
  const users = fc?.users?.[0]?.user ? [fc.users[0].user] : [];
  users.forEach((u: any) => {
    const games = u?.[1]?.games?.[0]?.game ?? [];
    games.forEach((g: any) => {
      const teams = g?.[1]?.teams?.[0]?.team ?? [];
      teams.forEach(pushFrom);
    });
  });

  // Another REST shape: fantasy_content.users.user[0].teams.team[]
  const teamsDirect = fc?.users?.[0]?.user?.[1]?.teams?.[0]?.team ?? [];
  teamsDirect.forEach(pushFrom);

  return out;
}

async function fetchUserTeamsRaw(yf: any) {
  const tried: string[] = [];
  const errors: Record<string, string> = {};

  // Try NFL by code, then by known keys (2025/24/23), then generic teams
  const paths = [
    "users;use_login=1/games;game_codes=nfl/teams?format=json",
    "users;use_login=1/games;game_keys=461/teams?format=json",
    "users;use_login=1/games;game_keys=449/teams?format=json",
    "users;use_login=1/games;game_keys=423/teams?format=json",
    "users;use_login=1/teams?format=json",
  ];

  for (const p of paths) {
    tried.push(p);
    try {
      const raw = await yf.api(p);
      const teams = normalizeTeams(raw);
      if (teams.length) {
        const leagues = dedupe(teams.map(t => t.league_key!).filter(Boolean));
        return { ok: true as const, teams, leagues, used: p, tried, errors };
      }
    } catch (e: any) {
      errors[p] = String(e?.message || e);
    }
  }
  return { ok: false as const, teams: [], leagues: [], used: null, tried, errors };
}

/**
 * Main entry: prefer RAW REST; if empty, try SDK as a fallback.
 * Returns detailed debug so we can see exactly which path works.
 */
export async function getUserTeamsNFL() {
  const { yf, reason } = await getYahooAuthed();
  if (!yf) return { ok: false as const, reason, teams: [], derived_league_keys: [], debug: { stage: "guard" } };

  // RAW first (more reliable)
  const raw = await fetchUserTeamsRaw(yf);
  if (raw.ok) {
    return {
      ok: true as const,
      teams: raw.teams,
      derived_league_keys: raw.leagues,
      debug: { stage: "raw", used: raw.used, tried: raw.tried, errors: raw.errors },
    };
  }

  // SDK fallback
  let sdkErr: string | null = null;
  try {
    const sdk = await yf.user.teams("nfl");
    const teams = normalizeTeams(sdk);
    if (teams.length) {
      const leagues = dedupe(teams.map(t => t.league_key!).filter(Boolean));
      return {
        ok: true as const,
        teams,
        derived_league_keys: leagues,
        debug: { stage: "sdk_success_after_raw_failed", rawTried: raw.tried, rawErrors: raw.errors },
      };
    }
  } catch (e: any) {
    sdkErr = String(e?.message || e);
  }

  return {
    ok: false as const,
    reason: "no_teams_found",
    teams: [],
    derived_league_keys: [],
    debug: { stage: "none_found", rawTried: raw.tried, rawErrors: raw.errors, sdkErr },
  };
}
