import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
import { auth } from "@clerk/nextjs/server";
import { saveUserTokens } from "@/lib/tokenStore/index";
import { parseAndVerifyState } from "@/lib/yahooOAuthState";

const RETURN_COOKIE = "yahoo_oauth_return";

function computeRedirect(req: NextRequest) {
  if (process.env.YAHOO_REDIRECT_URI) return process.env.YAHOO_REDIRECT_URI;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
  if (!host) return "";
  return `${proto}://${host}/api/yahoo/callback`;
}

function computeOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Same allowlist as /api/yahoo/login: /connect and /onboarding only. */
function sanitizeReturnPath(raw: string | null | undefined): string {
  const fallback = "/connect";
  if (!raw) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(raw, "https://placeholder.invalid");
  } catch {
    return fallback;
  }
  if (parsed.pathname !== "/connect" && parsed.pathname !== "/onboarding") return fallback;
  if (!raw.startsWith(parsed.pathname)) return fallback;
  return parsed.pathname + parsed.search;
}

/** Redirect back into the app with an auth status, clearing the return cookie. */
function finishRedirect(req: NextRequest, params: string): NextResponse {
  const returnPath = sanitizeReturnPath(req.cookies.get(RETURN_COOKIE)?.value);
  const sep = returnPath.includes("?") ? "&" : "?";
  const res = NextResponse.redirect(`${computeOrigin(req)}${returnPath}${sep}${params}`);
  res.cookies.set(RETURN_COOKIE, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" });
  return res;
}

function fail(req: NextRequest, reason: string): NextResponse {
  return finishRedirect(req, `auth=error&reason=${reason}`);
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

    // Yahoo sends error=access_denied when the user cancels the consent screen
    const yahooError = req.nextUrl.searchParams.get("error");
    if (yahooError) return fail(req, "denied");

    const code = req.nextUrl.searchParams.get("code");
    const stateParam = req.nextUrl.searchParams.get("state");
    if (!code) return fail(req, "missing_code");

    const secret = process.env.YAHOO_CLIENT_SECRET;
    if (!secret) return fail(req, "server_error");

    // Verify CSRF state — the userId inside state must match the Clerk userId
    const verify = parseAndVerifyState(stateParam, secret);
    if (!verify.ok || verify.userId !== userId) {
      return fail(req, "state_mismatch");
    }

    const clientId = process.env.YAHOO_CLIENT_ID;
    if (!clientId) return fail(req, "server_error");

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
      return fail(req, "exchange_failed");
    }

    await saveUserTokens(userId, tokens);
    console.log("[Yahoo Callback] Saved tokens for user", userId.slice(0, 8) + "...");

    return finishRedirect(req, "auth=success");
  } catch (e: any) {
    console.error("[Yahoo Callback] Error", e);
    return fail(req, "server_error");
  }
}
