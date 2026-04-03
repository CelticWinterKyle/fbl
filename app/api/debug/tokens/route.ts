import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserTokens, readUserLeague } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.DEBUG_ROUTES !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  const [tokens, league] = await Promise.all([
    readUserTokens(userId),
    readUserLeague(userId),
  ]);

  const res = NextResponse.json({
    userId: userId.slice(0, 8) + "...",
    tokens: tokens
      ? {
          hasAccess: !!tokens.access_token,
          hasRefresh: !!tokens.refresh_token,
          expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null,
          accessPrefix: tokens.access_token ? tokens.access_token.slice(0, 8) + "..." : null,
        }
      : null,
    league,
  });

  provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}
