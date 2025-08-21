import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserTokens, getTokenDir } from "@/lib/userTokenStore";
import { getValidAccessTokenForUser } from "@/lib/userTokenStore";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  try {
    const provisional = NextResponse.next();
    const { userId, created } = getOrCreateUserId(req, provisional);
    
    // Check environment variables
    const envCheck = {
      YAHOO_CLIENT_ID: !!process.env.YAHOO_CLIENT_ID,
      YAHOO_CLIENT_SECRET: !!process.env.YAHOO_CLIENT_SECRET,
      YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI || null,
      NODE_ENV: process.env.NODE_ENV,
    };
    
    // Check token storage
    const tokenDir = getTokenDir();
    let tokenFiles: Array<{name: string, size: number, modified: string}> = [];
    try {
      if (fs.existsSync(tokenDir)) {
        tokenFiles = fs.readdirSync(tokenDir)
          .filter(f => f.endsWith('.json') && !f.includes('.league.'))
          .map(f => ({
            name: f,
            size: fs.statSync(path.join(tokenDir, f)).size,
            modified: fs.statSync(path.join(tokenDir, f)).mtime.toISOString()
          }));
      }
    } catch (e) {
      console.error('Error reading token directory:', e);
    }
    
    // Check user's specific tokens
    const userTokens = userId ? readUserTokens(userId) : null;
    const validAccessToken = userId ? await getValidAccessTokenForUser(userId) : null;
    
    const diagnostic = {
      timestamp: new Date().toISOString(),
      userId: userId ? userId.slice(0, 8) + '...' : null,
      userIdCreated: created,
      cookieValue: req.cookies.get('fbl_uid')?.value?.slice(0, 8) + '...' || null,
      
      environment: envCheck,
      
      tokenStorage: {
        tokenDir,
        tokenDirExists: fs.existsSync(tokenDir),
        tokenFiles,
      },
      
      tokens: {
        userTokens: userTokens ? {
          hasAccessToken: !!userTokens.access_token,
          hasRefreshToken: !!userTokens.refresh_token,
          expiresAt: userTokens.expires_at ? new Date(userTokens.expires_at).toISOString() : null,
          isExpired: userTokens.expires_at ? Date.now() > userTokens.expires_at : null
        } : null,
      },
      
      authentication: {
        hasValidToken: !!validAccessToken,
        accessTokenPreview: validAccessToken ? validAccessToken.slice(0, 8) + '...' : null
      }
    };
    
    const res = NextResponse.json(diagnostic);
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
    
  } catch (error) {
    console.error('Auth diagnostic error:', error);
    return NextResponse.json({
      error: 'diagnostic_failed',
      message: String(error)
    }, { status: 500 });
  }
}
