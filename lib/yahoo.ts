import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";
import { getValidAccessTokenForUser } from "./userTokenStore";

/**
 * Central guard so we can easily short‑circuit Yahoo access when:
 *  - Explicit skip flag is set (SKIP_YAHOO === '1')
 *  - Required client credentials missing
 *  - No stored OAuth access token yet
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

export function getYahoo(accessToken: string) {
  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );
  yf.setUserToken(accessToken);
  return yf;
}

/** team_key looks like "461.l.12345.t.7" -> league key "461.l.12345" */
const TEAM_KEY_RE = /^(\d+)\.l\.(\d+)\.t\.(\d+)$/;
export function leagueKeyFromTeamKey(teamKey: string | null | undefined): string | null {
  // Add null/undefined checks
  if (!teamKey || typeof teamKey !== 'string') {
    return null;
  }
  const m = TEAM_KEY_RE.exec(teamKey);
  return m ? `${m[1]}.l.${m[2]}` : null;
}

type TeamLite = { team_key: string; name?: string; league_key: string | null };

function dedupe<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

/** Normalize both SDK and raw REST shapes into TeamLite[] */
function normalizeTeams(data: any): TeamLite[] {
  const out: TeamLite[] = [];
  
  // Add comprehensive logging
  console.log('normalizeTeams received data:', JSON.stringify(data, null, 2));
  
  const pushFrom = (team: any) => {
    try {
      // More defensive extraction
      let tk = null;
      let name = null;
      
      if (team?.team_key) {
        tk = team.team_key;
        name = team.name;
      } else if (team?.team?.[0]) {
        tk = team.team[0].team_key?.[0];
        name = team.team[0].name?.[0];
      }
      
      if (tk && typeof tk === 'string') {
        const league_key = leagueKeyFromTeamKey(tk);
        out.push({ 
          team_key: tk, 
          name: name || undefined, 
          league_key 
        });
      }
    } catch (e) {
      console.error('Error in pushFrom:', e, 'team data:', team);
    }
  };

  try {
    // SDK shape: { teams: [...] }
    if (Array.isArray(data?.teams)) {
      data.teams.forEach(pushFrom);
    }

    // REST shape: fantasy_content.users.user[0].games.game[].teams.team[]
    const fc = data?.fantasy_content;
    if (fc?.users?.[0]?.user) {
      const user = fc.users[0].user;
      
      // Handle games structure
      if (user[1]?.games?.[0]?.game) {
        const games = user[1].games[0].game;
        games.forEach((g: any) => {
          if (g?.[1]?.teams?.[0]?.team) {
            g[1].teams[0].team.forEach(pushFrom);
          }
        });
      }
      
      // Handle direct teams structure
      if (user[1]?.teams?.[0]?.team) {
        user[1].teams[0].team.forEach(pushFrom);
      }
    }
  } catch (e) {
    console.error('Error in normalizeTeams:', e);
  }

  console.log('normalizeTeams output:', out);
  return out;
}

async function fetchUserTeamsRaw(yf: any) {
  const tried: string[] = [];
  const errors: Record<string, string> = {};

  // Use current 2025 NFL season game key (461) first
  const paths = [
    "users;use_login=1/games;game_codes=nfl/teams?format=json",
    "users;use_login=1/games;game_keys=461/teams?format=json", // 2025 season
    "users;use_login=1/games;game_keys=449/teams?format=json", // 2024 season  
    "users;use_login=1/games;game_keys=423/teams?format=json", // 2023 season
    "users;use_login=1/teams?format=json",
  ];

  for (const p of paths) {
    tried.push(p);
    try {
      console.log(`Trying Yahoo API path: ${p}`);
      const raw = await yf.api(p);
      console.log(`Raw response for ${p}:`, JSON.stringify(raw, null, 2));
      
      const teams = normalizeTeams(raw);
      if (teams.length) {
        const leagues = dedupe(teams.map(t => t.league_key!).filter(Boolean));
        console.log(`Success with ${p}, found ${teams.length} teams`);
        return { ok: true as const, teams, leagues, used: p, tried, errors };
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.error(`Error with ${p}:`, errorMsg);
      errors[p] = errorMsg;
    }
  }
  return { ok: false as const, teams: [], leagues: [], used: null, tried, errors };
}

/**
 * Main entry: prefer RAW REST; if empty, try SDK as a fallback.
 */
export async function getUserTeamsNFL() {
  const { yf, reason } = await getYahooAuthed();
  if (!yf) {
    console.log('Yahoo guard failed:', reason);
    return { ok: false as const, reason, teams: [], derived_league_keys: [], debug: { stage: "guard" } };
  }

  console.log('Yahoo authenticated successfully, fetching teams...');

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

  // SDK fallback - with better error handling
  let sdkErr: string | null = null;
  try {
    console.log('Trying SDK fallback...');
    
    // Check if the methods exist before calling
    if (!yf.user) {
      throw new Error('yf.user is not available');
    }
    
    // Try different SDK method calls
    let sdk = null;
    try {
      sdk = await yf.user.teams("nfl");
    } catch (e1) {
      console.log('SDK user.teams("nfl") failed, trying user.games...');
      try {
        // Alternative SDK approach
        const games = await yf.user.games();
        console.log('User games:', JSON.stringify(games, null, 2));
        
        // Look for NFL game and get teams
        if (games?.games) {
          for (const game of games.games) {
            if (game.code === 'nfl' || game.game_key === '461') {
              sdk = await yf.user.game_teams(game.game_key);
              break;
            }
          }
        }
      } catch (e2) {
        throw e1; // Throw original error
      }
    }
    
    if (sdk) {
      console.log('SDK response:', JSON.stringify(sdk, null, 2));
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
    }
  } catch (e: any) {
    sdkErr = String(e?.message || e);
    console.error('SDK error:', sdkErr);
  }

  return {
    ok: false as const,
    reason: "no_teams_found",
    teams: [],
    derived_league_keys: [],
    debug: { stage: "none_found", rawTried: raw.tried, rawErrors: raw.errors, sdkErr },
  };
}