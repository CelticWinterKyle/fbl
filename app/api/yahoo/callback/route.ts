import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { auth } from "@clerk/nextjs/server";
import { saveUserTokens } from "@/lib/tokenStore/index";
import { parseAndVerifyState } from "@/lib/userSession";

function computeRedirect(req: NextRequest) {
  if (process.env.YAHOO_REDIRECT_URI) return process.env.YAHOO_REDIRECT_URI;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  if (!host) return "";
  return `${proto}://${host}/api/yahoo/callback`;
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

    const code = req.nextUrl.searchParams.get("code");
    const stateParam = req.nextUrl.searchParams.get("state");
    if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

    const secret = process.env.YAHOO_CLIENT_SECRET;
    if (!secret) return NextResponse.json({ error: "missing_server_secret" }, { status: 500 });

    // Verify CSRF state — the userId inside state must match the Clerk userId
    const verify = parseAndVerifyState(stateParam, secret);
    if (!verify.ok || verify.userId !== userId) {
      return NextResponse.json({ error: "bad_state", detail: verify.error }, { status: 400 });
    }

    const clientId = process.env.YAHOO_CLIENT_ID;
    if (!clientId) return NextResponse.json({ error: "missing_client_id" }, { status: 500 });

    const credentials = `${clientId}:${secret}`;
    const encodedCredentials = Buffer.from(credentials).toString("base64");

    const body = new URLSearchParams({
      redirect_uri: computeRedirect(req),
      code,
      grant_type: "authorization_code",
    });

    const r = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${encodedCredentials}`,
      },
      body,
    });

    const tokens = await r.json();
    if (!r.ok) {
      console.error("[Yahoo Callback] Token exchange failed", r.status);
      return NextResponse.json({ ok: false, error: "token_exchange_failed" }, { status: r.status });
    }

    await saveUserTokens(userId, tokens);
    console.log("[Yahoo Callback] Saved tokens for user", userId.slice(0, 8) + "...");

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    return NextResponse.redirect(`${proto}://${host}/connect?auth=success`);
  } catch (e: any) {
    console.error("[Yahoo Callback] Error", e);
    return NextResponse.json({ error: "callback_crash", detail: e?.message || String(e) }, { status: 500 });
  }
}
