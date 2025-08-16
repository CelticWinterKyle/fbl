import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId, makeState } from "@/lib/userSession";

function computeRedirect(req: NextRequest) {
  if (process.env.YAHOO_REDIRECT_URI) return process.env.YAHOO_REDIRECT_URI;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  if (!host) return "";
  return `${proto}://${host}/api/yahoo/callback`;
}

export async function GET(req: NextRequest) {
  const clientId = process.env.YAHOO_CLIENT_ID;
  if (!clientId) return NextResponse.json({ ok:false, error:"missing_client_id" }, { status:500 });
  const redirectUri = computeRedirect(req);
  if (!redirectUri) return NextResponse.json({ ok:false, error:"cannot_resolve_redirect_uri" }, { status:500 });

  // Basic validation hint (Yahoo requires https except localhost dev)
  if (!redirectUri.includes("localhost") && !redirectUri.startsWith("https://")) {
    return NextResponse.json({ ok:false, error:"redirect_uri_must_be_https", redirectUri }, { status:500 });
  }

  const tempRes = NextResponse.next();
  const { userId } = getOrCreateUserId(req, tempRes);
  const state = makeState(userId, process.env.YAHOO_CLIENT_SECRET || clientId);
  const scope = process.env.YAHOO_SCOPE || "fspt-r"; // later maybe fspt-w
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    state,
  });
  const authUrl = "https://api.login.yahoo.com/oauth2/request_auth?" + p.toString();
  if (req.nextUrl.searchParams.get("debug") === "1") {
    const dbg = NextResponse.json({ ok:true, mode:"debug", clientId, redirectUri, scope, state, authUrl, userId });
    tempRes.cookies.getAll().forEach(c => dbg.cookies.set(c));
    return dbg;
  }
  const redirect = NextResponse.redirect(authUrl);
  tempRes.cookies.getAll().forEach(c => redirect.cookies.set(c));
  return redirect;
}
