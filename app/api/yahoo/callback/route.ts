import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic"; // OAuth callback must be dynamic
export const runtime = "nodejs"; // ensure full Node APIs
import { saveUserTokens } from "@/lib/userTokenStore";
import { parseAndVerifyState, getOrCreateUserId, setUserIdCookie } from "@/lib/userSession";

function computeRedirect(req: NextRequest) {
  if (process.env.YAHOO_REDIRECT_URI) return process.env.YAHOO_REDIRECT_URI;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  if (!host) return "";
  return `${proto}://${host}/api/yahoo/callback`;
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const stateParam = req.nextUrl.searchParams.get("state");
    if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
    const secret = process.env.YAHOO_CLIENT_SECRET;
    if (!secret) return NextResponse.json({ error: "missing_server_secret" }, { status: 500 });
    const verify = parseAndVerifyState(stateParam, secret);
    if (!verify.ok) return NextResponse.json({ error: "bad_state", detail: verify.error }, { status: 400 });

    const clientId = process.env.YAHOO_CLIENT_ID;
    if (!clientId) return NextResponse.json({ error: "missing_client_id" }, { status: 500 });
    const clientSecret = secret;
    const redirectUri = computeRedirect(req);
    
    // Create Basic Auth header as per Yahoo's OAuth 2.0 spec
    const credentials = `${clientId}:${clientSecret}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    const body = new URLSearchParams({
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });

    const r = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${encodedCredentials}`
      },
      body
    });
    const tokens = await r.json();
    if (!r.ok) {
      console.error('[Yahoo Callback] token exchange failed', tokens);
      return NextResponse.json(tokens, { status: r.status });
    }

    // Create the response first but don't redirect yet
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const welcomeUrl = host ? `${proto}://${host}/welcome?auth=success` : "/welcome?auth=success";
    
    // Handle user ID alignment BEFORE creating final response
    const provisional = NextResponse.next();
    const { userId } = getOrCreateUserId(req, provisional);
    const finalUserId = verify.userId || userId;
    
    console.log('[Yahoo Callback] User ID alignment:', {
      cookieUserId: userId.slice(0,8) + '...',
      stateUserId: verify.userId?.slice(0,8) + '...' || 'none',
      finalUserId: finalUserId.slice(0,8) + '...',
      needsUpdate: finalUserId !== userId
    });
    
    // Save tokens under the correct user ID
    const savedTokens = await saveUserTokens(finalUserId, tokens);
    if (!savedTokens || !savedTokens.access_token) {
      console.error('[Yahoo Callback] Failed to save tokens for user', finalUserId.slice(0,8)+'...');
      return NextResponse.json({ 
        error: "token_save_failed", 
        detail: "Failed to save authentication tokens" 
      }, { status: 500 });
    }
    
    console.log('[Yahoo Callback] Successfully saved tokens for user', finalUserId.slice(0,8)+'...');
    
    // Create final response with proper cookie
    const res = NextResponse.redirect(welcomeUrl);
    if (finalUserId !== userId) {
      setUserIdCookie(finalUserId, res);
      console.log('[Yahoo Callback] Updated user ID cookie to match state');
    } else {
      // Ensure cookie is set even if IDs match
      provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    }
    
    // CRITICAL: Set cache control headers to prevent cookie caching issues
    res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
    
    console.log('[Yahoo Callback] Final redirect with userId cookie:', finalUserId.slice(0,8)+'...');
    return res;
  } catch (e:any) {
    console.error("[Yahoo Callback] fatal", e);
    return NextResponse.json({ error: "callback_crash", detail: e?.message || String(e) }, { status: 500 });
  }
}
