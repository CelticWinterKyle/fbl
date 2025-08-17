import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { saveUserLeague } from "@/lib/userLeagueStore";

export const dynamic = "force-dynamic";

async function validateLeagueAccess(yf: any, league_key: string) {
  try {
    // Try to get league metadata to validate access
    const meta = await new Promise<any>((resolve, reject) => {
      try {
        yf.league.meta(league_key, (err: any, data: any) => {
          if (err) return reject(err);
          if (data) return resolve(data);
          reject(new Error('No data returned'));
        });
      } catch (e) {
        reject(e);
      }
    });
    
    return {
      valid: true,
      name: meta?.name || meta?.league?.name || null,
      league_id: meta?.league_id || league_key.split('.l.')[1]?.split('.')[0] || null
    };
  } catch (error) {
    console.error('League validation error:', error);
    return {
      valid: false,
      error: String(error)
    };
  }
}

export async function POST(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  
  let body: any = {};
  try { 
    body = await req.json(); 
  } catch (e) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  
  const league_key = (body.league_key || body.leagueKey || "").trim();
  if (!league_key) {
    return NextResponse.json({ ok: false, error: "missing_league_key" }, { status: 400 });
  }
  
  const { yf, reason } = await getYahooAuthedForUser(userId);
  if (!yf) {
    return NextResponse.json({ 
      ok: false, 
      error: reason || 'not_authed',
      suggestion: 'Please reconnect to Yahoo Fantasy'
    }, { status: 403 });
  }
  
  try {
    const validation = await validateLeagueAccess(yf, league_key);
    
    if (!validation.valid) {
      return NextResponse.json({ 
        ok: false, 
        error: "invalid_league_key",
        details: validation.error,
        suggestion: 'Make sure you have access to this league and the league key is correct'
      }, { status: 400 });
    }
    
    // Save the league selection for this user
    saveUserLeague(userId, league_key);
    
    const res = NextResponse.json({ 
      ok: true, 
      league_key, 
      name: validation.name,
      league_id: validation.league_id
    });
    
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
    
  } catch (e: any) {
    console.error('League validation route error:', e);
    return NextResponse.json({ 
      ok: false, 
      error: 'validation_failed',
      details: e?.message || String(e),
      suggestion: 'Check server logs for detailed error information'
    }, { status: 500 });
  }
}
