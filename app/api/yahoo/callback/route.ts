import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic"; // OAuth callback must be dynamic
export const runtime = "nodejs"; // ensure full Node APIs
import { saveUserTokens } from "@/lib/userTokenStore";
import { parseAndVerifyState, getOrCreateUserId } from "@/lib/userSession";

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
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });

    const r = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const tokens = await r.json();
    if (!r.ok) return NextResponse.json(tokens, { status: r.status });

    // Ensure cookie and token are set before redirect
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const dashboardUrl = host ? `${proto}://${host}/dashboard?auth=success` : "/dashboard?auth=success";
    const res = NextResponse.redirect(dashboardUrl);
    const { userId } = getOrCreateUserId(req, res); // ensure cookie
    await saveUserTokens(verify.userId || userId, tokens); // ensure token is saved before redirect
    return res;
  } catch (e:any) {
    console.error("[Yahoo Callback] fatal", e);
    return NextResponse.json({ error: "callback_crash", detail: e?.message || String(e) }, { status: 500 });
  }
}
