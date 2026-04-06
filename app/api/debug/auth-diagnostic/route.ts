import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { readUserTokens, getValidAccessTokenForUser } from "@/lib/tokenStore/index";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  if (process.env.DEBUG_ROUTES !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const { userId } = await auth();
    const created = false;

    const userTokens = userId ? await readUserTokens(userId) : null;
    const validAccessToken = userId ? await getValidAccessTokenForUser(userId) : null;

    const diagnostic = {
      timestamp: new Date().toISOString(),
      userId: userId ? userId.slice(0, 8) + "..." : null,
      userIdCreated: created,
      environment: {
        YAHOO_CLIENT_ID: !!process.env.YAHOO_CLIENT_ID,
        YAHOO_CLIENT_SECRET: !!process.env.YAHOO_CLIENT_SECRET,
        YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI || null,
        KV_AVAILABLE: !!process.env.KV_REST_API_URL,
        NODE_ENV: process.env.NODE_ENV,
      },
      tokens: {
        hasAccessToken: !!userTokens?.access_token,
        hasRefreshToken: !!userTokens?.refresh_token,
        expiresAt: userTokens?.expires_at ? new Date(userTokens.expires_at).toISOString() : null,
        isExpired: userTokens?.expires_at ? Date.now() > userTokens.expires_at : null,
      },
      authentication: {
        hasValidToken: !!validAccessToken,
        accessTokenPreview: validAccessToken ? validAccessToken.slice(0, 8) + "..." : null,
      },
    };

    const res = NextResponse.json(diagnostic);
    return res;
  } catch (error) {
    return NextResponse.json({ error: "diagnostic_failed", message: String(error) }, { status: 500 });
  }
}
