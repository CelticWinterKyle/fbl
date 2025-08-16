import { NextResponse } from "next/server";
import { readTokens } from "@/lib/tokenStore";
import { getYahooAuthed } from "@/lib/yahoo";

export async function GET() {
  const redirectEnv = process.env.YAHOO_REDIRECT_URI || null;
  const tokens = readTokens();
  const { yf, reason } = await getYahooAuthed();
  return NextResponse.json({
    ok: true,
    reason,
    hasClient: !!process.env.YAHOO_CLIENT_ID,
    hasSecret: !!process.env.YAHOO_CLIENT_SECRET,
    leagueId: process.env.YAHOO_LEAGUE_ID || null,
    redirectEnv,
    envFlags: {
      SKIP_YAHOO: process.env.SKIP_YAHOO || null,
      SKIP_YAHOO_DURING_BUILD: process.env.SKIP_YAHOO_DURING_BUILD || null,
      NEXT_PHASE: process.env.NEXT_PHASE || null,
    },
    tokenPreview: tokens?.access_token ? {
      access_token: tokens.access_token.slice(0,8) + '…',
      expires_at: tokens.expires_at || null,
      has_refresh: !!tokens.refresh_token,
    } : null,
  });
}
