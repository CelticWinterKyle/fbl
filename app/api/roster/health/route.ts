import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  
  if (!userId) {
    return NextResponse.json({ 
      ok: false, 
      status: 'no_user_id',
      timestamp: Date.now()
    }, { status: 400 });
  }

  const { access, reason: authReason } = await getYahooAuthedForUser(userId);
  
  if (!access) {
    return NextResponse.json({ 
      ok: false, 
      status: 'auth_failed',
      reason: authReason,
      timestamp: Date.now()
    }, { status: 401 });
  }

  // Quick test of Yahoo API connectivity
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout for health check
    
    const testResponse = await fetch('https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1?format=json', {
      headers: { 
        Authorization: `Bearer ${access}`,
        'Accept': 'application/json',
        'User-Agent': 'FBL/1.0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    const responseOk = testResponse.ok;
    const status = testResponse.status;
    
    return NextResponse.json({
      ok: responseOk,
      status: responseOk ? 'healthy' : 'yahoo_api_error',
      yahoo_status: status,
      user_id: userId.slice(0, 8) + '...',
      timestamp: Date.now()
    });
    
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      status: 'connectivity_error',
      error: error.message || 'Unknown error',
      timestamp: Date.now()
    }, { status: 503 });
  }
}
