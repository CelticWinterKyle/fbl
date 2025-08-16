import { NextRequest, NextResponse } from "next/server";
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
  const code = req.nextUrl.searchParams.get("code");
  const stateParam = req.nextUrl.searchParams.get("state");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  const verify = parseAndVerifyState(stateParam, process.env.YAHOO_CLIENT_SECRET!);
  if (!verify.ok) return NextResponse.json({ error: "bad_state", detail: verify.error }, { status: 400 });

  const clientId = process.env.YAHOO_CLIENT_ID!;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET!;
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
  const res = NextResponse.redirect("/");
  const { userId } = getOrCreateUserId(req, res); // ensure cookie
  saveUserTokens(verify.userId || userId, tokens);

  // Redirect back to the external (tunnel) host
  return res;
}
