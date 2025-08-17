import { NextResponse } from "next/server";
import { getUserTeamsNFL, getYahooAuthed } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  try {
    // First check if Yahoo auth is working
    const authCheck = await getYahooAuthed();
    console.log('Auth check result:', authCheck);
    
    if (!authCheck.yf) {
      const statusCode = authCheck.reason === 'no_token' ? 401 : 400;
      return NextResponse.json({
        ok: false,
        reason: authCheck.reason,
        debug_info: {
          auth_status: 'failed',
          auth_reason: authCheck.reason,
          env_check: {
            has_client_id: !!process.env.YAHOO_CLIENT_ID,
            has_client_secret: !!process.env.YAHOO_CLIENT_SECRET,
            skip_yahoo: process.env.SKIP_YAHOO
          }
        }
      }, { status: statusCode });
    }

    // Test a simple API call first
    try {
      const simpleTest = await authCheck.yf.api('user?format=json');
      console.log('Simple user API test result:', JSON.stringify(simpleTest, null, 2));
    } catch (e) {
      console.error('Simple user API test failed:', e);
      return NextResponse.json({
        ok: false,
        reason: 'auth_test_failed',
        debug_info: {
          auth_status: 'token_invalid',
          error: String(e),
          suggestion: 'Try re-authenticating with Yahoo'
        }
      }, { status: 401 });
    }

    const res = await getUserTeamsNFL();
    if (!res.ok) {
      const statusCode = res.reason === 'no_token' || res.reason === 'auth_failed' ? 401 : 400;
      return NextResponse.json(debug ? res : { ok: false, reason: res.reason }, { status: statusCode });
    }
    
    return NextResponse.json(debug ? res : {
      ok: true,
      game_key: "nfl",
      team_count: res.teams.length,
      teams: res.teams,
      derived_league_keys: res.derived_league_keys,
    });
  } catch (error) {
    console.error('Route error:', error);
    return NextResponse.json({
      ok: false,
      reason: 'route_error',
      error: String(error),
      suggestion: 'Check server logs for detailed error information'
    }, { status: 500 });
  }
}