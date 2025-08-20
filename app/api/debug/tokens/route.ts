import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserTokens } from "@/lib/userTokenStore";
import { readUserLeague } from "@/lib/userLeagueStore";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// Use same directory logic as token store
function getTokenDir(): string {
  if (process.env.YAHOO_TOKEN_DIR) return process.env.YAHOO_TOKEN_DIR;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.cwd().startsWith("/var/task")) {
    return "/tmp/yahoo-users";
  }
  return path.join(process.cwd(), "lib", "yahoo-users");
}

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  
  // Check token storage locations
  const currentDir = getTokenDir();
  const legacyDir = path.join(process.cwd(), "lib", "yahoo-users");
  const dirs = [currentDir];
  if (currentDir !== legacyDir) {
    dirs.push(legacyDir);
  }
  
  const dirStatus: Record<string, any> = {};
  for (const dir of dirs) {
    try {
      const exists = fs.existsSync(dir);
      const files = exists ? fs.readdirSync(dir) : [];
      dirStatus[dir] = { exists, files, isCurrent: dir === currentDir };
    } catch (e) {
      dirStatus[dir] = { exists: false, error: String(e), isCurrent: dir === currentDir };
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
      isLambda: !!process.env.AWS_LAMBDA_FUNCTION_NAME,
      hasYahooClient: !!process.env.YAHOO_CLIENT_ID,
      hasYahooSecret: !!process.env.YAHOO_CLIENT_SECRET,
      currentTokenDir: currentDir
    }
  };
  
  const res = NextResponse.json(response);
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
