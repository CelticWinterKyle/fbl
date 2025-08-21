import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
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
    
    // Exchange code for tokens
    const credentials = `${clientId}:${secret}`;
    const encodedCredentials = Buffer.from(credentials).toString('base64');
    
    const body = new URLSearchParams({
      redirect_uri: computeRedirect(req),
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
      console.error('[Yahoo Callback] Token exchange failed', tokens);
      return NextResponse.json(tokens, { status: r.status });
    }

    // Get or create user ID and save tokens
    const provisional = NextResponse.next();
    const { userId } = getOrCreateUserId(req, provisional);
    const finalUserId = verify.userId || userId;
    
    // Save tokens for this user - simple, no fallbacks
    await saveUserTokens(finalUserId, tokens);
    console.log('[Yahoo Callback] Saved tokens for user', finalUserId.slice(0,8)+'...');
    
    // Redirect with success flag
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const welcomeUrl = `${proto}://${host}/welcome?auth=success`;
    
    const res = NextResponse.redirect(welcomeUrl);
    setUserIdCookie(finalUserId, res);
    
    return res;
  } catch (e: any) {
    console.error("[Yahoo Callback] Error", e);
    return NextResponse.json({ error: "callback_crash", detail: e?.message || String(e) }, { status: 500 });
  }
}

