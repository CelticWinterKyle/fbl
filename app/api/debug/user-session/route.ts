import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { readUserLeague, readUserTokens } from "@/lib/tokenStore/index";

export async function GET(request: NextRequest) {
  if (process.env.DEBUG_ROUTES !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const wasCreated = false;

  const [userLeague, userTokens] = await Promise.all([
    readUserLeague(userId),
    readUserTokens(userId),
  ]);

  const tokenExpiry = userTokens?.expires_at ? new Date(userTokens.expires_at) : null;

  return NextResponse.json({
    ok: true,
    session: { userId, wasCreated, hasExistingSession: !!userId },
    league: { selectedLeague: userLeague, hasSelection: !!userLeague },
    tokens: {
      hasTokens: !!userTokens?.access_token,
      isValid: tokenExpiry ? tokenExpiry > new Date() : false,
      expiresAt: tokenExpiry?.toISOString(),
      tokenPrefix: userTokens?.access_token ? userTokens.access_token.slice(0, 8) + "..." : null,
    },
    environment: {
      kvAvailable: !!process.env.KV_REST_API_URL,
      nodeEnv: process.env.NODE_ENV,
      hasYahooCredentials: !!(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET),
    },
  });
}
