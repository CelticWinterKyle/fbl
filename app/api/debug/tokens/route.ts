import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserTokens } from "@/lib/userTokenStore";
import { readUserLeague } from "@/lib/userLeagueStore";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  
  // Check token storage locations
  const dirs = [
    path.join(process.cwd(), "lib", "yahoo-users"),
    "/tmp/yahoo-users"
  ];
  
  const dirStatus: Record<string, any> = {};
  for (const dir of dirs) {
    try {
      const exists = fs.existsSync(dir);
      const files = exists ? fs.readdirSync(dir) : [];
      dirStatus[dir] = { exists, files };
    } catch (e) {
      dirStatus[dir] = { exists: false, error: String(e) };
    }
  }
  
  const tokens = readUserTokens(userId);
  const league = readUserLeague(userId);
  
  const response = {
    userId: userId.slice(0, 8) + "...",
    tokens: tokens ? {
      hasAccess: !!tokens.access_token,
      hasRefresh: !!tokens.refresh_token,
      expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null,
      accessPrefix: tokens.access_token?.slice(0, 8) + "..." || null
    } : null,
    league,
    directories: dirStatus,
    environment: {
      cwd: process.cwd(),
      NODE_ENV: process.env.NODE_ENV,
      isVercel: !!process.env.VERCEL,
      hasYahooClient: !!process.env.YAHOO_CLIENT_ID,
      hasYahooSecret: !!process.env.YAHOO_CLIENT_SECRET
    }
  };
  
  const res = NextResponse.json(response);
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
