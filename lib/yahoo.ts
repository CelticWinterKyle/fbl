import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";
import { getValidAccessTokenForUser } from "./userTokenStore";

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

const TEAM_KEY_RE = /^(\d+)\.l\.(\d+)\.t\.(\d+)$/;
export function leagueKeyFromTeamKey(teamKey: string | null | undefined): string | null {
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

function normalizeTeams(data: any): TeamLite[] {
  const out: TeamLite[] = [];
  
  console.log('normalizeTeams received data:', JSON.stringify(data, null, 2));
  
  const pushFrom = (team: any) => {
    try {
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
    if (Array.isArray(data?.teams)) {
      data.teams.forEach(pushFrom);
    }

    const fc = data?.fantasy_content;
    if (fc?.users?.[0]?.user) {
      const user = fc.users[0].user;
      
      if (user[1]?.games?.[0]?.game) {
        const games = user[1].games[0].game;
        games.forEach((g: any) => {
          if (g?.[1]?.teams?.[0]?.team) {
            g[1].teams[0].team.forEach(pushFrom);
          }
        });
      }
      
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

// Enhanced direct HTTP request with better error reporting
async function makeDirectYahooRequest(accessToken: string, path: string) {
  const baseUrl = 'https://fantasysports.yahooapis.com/fantasy/v2';
  const url = `${baseUrl}/${path}`;
  
  console.log(`Making direct request to: ${url}`);
  console.log(`Using access token: ${accessToken.substring(0, 10)}...${accessToken.substring(accessToken.length - 10)}`);
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FamilyBizFootball/1.0)'
    }
  });

  console.log(`Response status: ${response.status} ${response.statusText}`);
  console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`HTTP Error Response Body:`, errorText);
    throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  return result;
}

// Test different authentication approaches
async function testYahooAuth(accessToken: string) {
  const tests = [
    'user?format=json',
    'users;use_login=1?format=json', 
    'users;use_login=1/games?format=json',
    'users;use_login=1/games;game_codes=nfl?format=json'
  ];

  const results: Record<string, any> = {};

  for (const test of tests) {
    try {
      console.log(`\n=== Testing: ${test} ===`);
      const result = await makeDirectYahooRequest(accessToken, test);
      results[test] = { success: true, data: result };
      console.log(`✅ Success for ${test}`);
    } catch (e) {
      results[test] = { success: false, error: String(e) };
      console.log(`❌ Failed for ${test}:`, e);
    }
  }

  return results;
}

export async function getUserTeamsNFL() {
  const { yf, access, reason } = await getYahooAuthed();
  if (!yf || !access) {
    console.log('Yahoo guard failed:', reason);
    return { 
      ok: false as const, 
      reason, 
      teams: [], 
      derived_league_keys: [], 
      debug: { 
        stage: "guard",
        env_check: {
          has_client_id: !!process.env.YAHOO_CLIENT_ID,
          has_client_secret: !!process.env.YAHOO_CLIENT_SECRET,
          skip_yahoo: process.env.SKIP_YAHOO,
          token_available: !!access
        }
      } 
    };
  }

  console.log('=== YAHOO AUTHENTICATION DEBUG ===');
  console.log(`Access token length: ${access.length}`);
  console.log(`Access token preview: ${access.substring(0, 20)}...`);

  // Run comprehensive auth tests
  const authTests = await testYahooAuth(access);
  console.log('\n=== AUTH TEST RESULTS ===');
  console.log(JSON.stringify(authTests, null, 2));

  // Check if any basic auth test worked
  const basicAuthWorked = Object.values(authTests).some((test: any) => test.success);
  
  if (!basicAuthWorked) {
    return {
      ok: false as const,
      reason: "auth_failed",
      teams: [],
      derived_league_keys: [],
      debug: {
        stage: "auth_test_failed",
        auth_tests: authTests,
        token_preview: access.substring(0, 20) + '...'
      }
    };
  }

  console.log('\n=== BASIC AUTH WORKING - TESTING TEAM ENDPOINTS ===');

  // Now test the specific team endpoints that were failing
  const teamTests = [
    "users;use_login=1/games;game_codes=nfl/teams?format=json",
    "users;use_login=1/games;game_keys=461/teams?format=json",
    "users;use_login=1/teams?format=json",
  ];

  const tried: string[] = [];
  const errors: Record<string, string> = {};
  
  for (const path of teamTests) {
    tried.push(path);
    try {
      console.log(`\n=== Testing team endpoint: ${path} ===`);
      const raw = await makeDirectYahooRequest(access, path);
      console.log(`Team endpoint success for ${path}`);
      
      const teams = normalizeTeams(raw);
      if (teams.length > 0) {
        const leagues = dedupe(teams.map(t => t.league_key!).filter(Boolean));
        console.log(`Found ${teams.length} teams with ${leagues.length} leagues`);
        return {
          ok: true as const,
          teams,
          derived_league_keys: leagues,
          debug: { 
            stage: "direct_http_success", 
            used: path, 
            tried, 
            errors,
            auth_tests: authTests
          },
        };
      } else {
        console.log(`No teams found in response for ${path}`);
      }
    } catch (e: any) {
      const errorMsg = String(e?.message || e);
      console.error(`Team endpoint failed for ${path}:`, errorMsg);
      errors[path] = errorMsg;
    }
  }

  return {
    ok: false as const,
    reason: "no_teams_found",
    teams: [],
    derived_league_keys: [],
    debug: { 
      stage: "no_teams_despite_auth_success", 
      tried, 
      errors,
      auth_tests: authTests,
      note: "Authentication works but no teams found - user may not be in any fantasy leagues"
    },
  };
}