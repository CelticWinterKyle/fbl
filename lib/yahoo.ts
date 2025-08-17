import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";
import { getValidAccessTokenForUser } from "./userTokenStore";
import { logYahooError, logYahooSuccess } from "./yahooErrorLogger";

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

export async function getYahooAuthed(): Promise<YahooGuard> {
  if (shouldSkipYahoo()) return { yf: null, access: null, reason: "skip_flag" };
  
  if (!validateEnvironment()) {
    return { yf: null, access: null, reason: "env_validation_failed" };
  }
  
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

// Enhanced direct HTTP request with better error reporting and retry logic
async function makeDirectYahooRequest(accessToken: string, path: string, retries = 3) {
  const baseUrl = 'https://fantasysports.yahooapis.com/fantasy/v2';
  const url = `${baseUrl}/${path}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`Making direct request to: ${url} (attempt ${attempt}/${retries})`);
    console.log(`Using access token: ${accessToken.substring(0, 10)}...${accessToken.substring(accessToken.length - 10)}`);
    
    try {
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
        const contentType = response.headers.get('content-type') || '';
        let errorDetails = '';
        
        try {
          if (contentType.includes('application/json')) {
            const errorJson = await response.json();
            errorDetails = JSON.stringify(errorJson, null, 2);
          } else {
            errorDetails = await response.text();
          }
        } catch (e) {
          errorDetails = 'Unable to parse error response';
        }
        
        console.error(`HTTP Error Response Body:`, errorDetails);
        
        // Log structured error
        const errorContext = {
          endpoint: path,
          method: 'GET',
          tokenInfo: {
            hasToken: !!accessToken,
            tokenPreview: accessToken.substring(0, 10) + '...',
            isExpired: false // We don't know this here
          },
          responseStatus: response.status,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          errorType: response.status === 401 ? 'auth' as const : 
                    response.status === 429 ? 'api' as const : 'api' as const
        };
        
        const error = new Error(
          response.status === 401 ? `Authentication failed: Access token may be expired or invalid` :
          response.status === 403 ? `Access forbidden: Check API permissions and league access` :
          response.status === 429 ? `Rate limit exceeded: Too many API requests` :
          `HTTP ${response.status}: ${response.statusText} - ${errorDetails}`
        );
        
        logYahooError(error, errorContext);
        
        // Don't retry on client errors (4xx), only server errors (5xx) and rate limits
        if (response.status === 429 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Rate limited, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        } else if (response.status >= 500 && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Server error, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }

      const result = await response.json();
      
      // Log successful requests
      logYahooSuccess(result, {
        endpoint: path,
        method: 'GET',
        tokenInfo: {
          hasToken: !!accessToken,
          tokenPreview: accessToken.substring(0, 10) + '...'
        }
      });
      
      return result;
      
    } catch (error) {
      if (attempt === retries) {
        // Log final failure
        logYahooError(error, {
          endpoint: path,
          method: 'GET',
          tokenInfo: {
            hasToken: !!accessToken,
            tokenPreview: accessToken.substring(0, 10) + '...'
          },
          errorType: 'network'
        });
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Request failed, retrying in ${delay}ms:`, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
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