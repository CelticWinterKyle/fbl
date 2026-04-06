import { NextRequest, NextResponse } from "next/server";
import { readUserTokens, readUserLeague } from "@/lib/tokenStore/index";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const [tokens, userLeague] = await Promise.all([
    readUserTokens(userId),
    readUserLeague(userId),
  ]);

  const hasToken = !!tokens?.access_token;
  const now = Date.now();
  const exp = tokens?.expires_at || 0;
  const bufferMs = 120_000;
  const isExpired = exp ? now >= exp - bufferMs : false;
  const tokenReady = hasToken && !isExpired;
  const leagueReady = tokenReady && !!userLeague;

  const res = NextResponse.json({
    ok: tokenReady,
    userId,
    reason: tokenReady ? null : "no_token",
    userLeague,
    leagueReady,
    tokenReady,
    tokenPreview: tokens?.access_token
      ? {
          access_token: tokens.access_token.slice(0, 8) + "…",
          expires_at: tokens.expires_at || null,
          has_refresh: !!tokens.refresh_token,
        }
      : null,
    tokenExpired: isExpired,
  });

  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
