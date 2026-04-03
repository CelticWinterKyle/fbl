import { NextRequest, NextResponse } from "next/server";
import { readUserTokens } from "@/lib/tokenStore/index";
import { getOrCreateUserId } from "@/lib/userSession";

export async function GET(request: NextRequest) {
  if (process.env.DEBUG_ROUTES !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(request, provisional);
  const userTokens = await readUserTokens(userId);
  const userExpiry = userTokens?.expires_at ? new Date(userTokens.expires_at) : null;

  return NextResponse.json({
    ok: true,
    environment: {
      nodeEnv: process.env.NODE_ENV,
      kvAvailable: !!process.env.KV_REST_API_URL,
      hasYahooCredentials: !!(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET),
      hasOpenAI: !!process.env.OPENAI_API_KEY,
    },
    storage: {
      user: {
        userId,
        hasTokens: !!userTokens?.access_token,
        isValid: userExpiry ? userExpiry > new Date() : false,
        expiresAt: userExpiry?.toISOString(),
        tokenPrefix: userTokens?.access_token ? userTokens.access_token.slice(0, 8) + "..." : null,
      },
    },
  });
}
