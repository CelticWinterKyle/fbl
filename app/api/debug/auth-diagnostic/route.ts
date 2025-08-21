import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { readUserTokens } from "@/lib/userTokenStore";
import { getOAuthTokens } from "@/lib/oauthTempStorage";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function getTokenDir(): string {
  if (process.env.YAHOO_TOKEN_DIR) return process.env.YAHOO_TOKEN_DIR;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.cwd().startsWith("/var/task")) {
    return "/tmp/yahoo-users";
  }
  return path.join(process.cwd(), "lib", "yahoo-users");
}

export async function GET(req: NextRequest) {
  try {
    const provisional = NextResponse.next();
    const { userId, created } = getOrCreateUserId(req, provisional);
    
    // Check environment variables
    const envCheck = {
      YAHOO_CLIENT_ID: !!process.env.YAHOO_CLIENT_ID,
      YAHOO_CLIENT_SECRET: !!process.env.YAHOO_CLIENT_SECRET,
      YAHOO_REDIRECT_URI: process.env.YAHOO_REDIRECT_URI || null,
      SKIP_YAHOO: process.env.SKIP_YAHOO || null,
      VERCEL: !!process.env.VERCEL,
      NODE_ENV: process.env.NODE_ENV,
    };
    
    // Check token storage
    const tokenDir = getTokenDir();
    let tokenFiles = [];
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
    const oauthTempTokens = getOAuthTokens();
    
    // Test authentication
    const authResult = userId ? await getYahooAuthedForUser(userId) : { reason: 'no_user' };
    
    // Check if user's token file exists
    let userTokenFileExists = false;
    let userTokenFileContent = null;
    if (userId) {
      try {
        const userTokenFile = path.join(tokenDir, `${userId}.json`);
        userTokenFileExists = fs.existsSync(userTokenFile);
        if (userTokenFileExists) {
          const content = fs.readFileSync(userTokenFile, 'utf8');
          userTokenFileContent = JSON.parse(content);
        }
      } catch (e) {
        console.error('Error checking user token file:', e);
      }
    }
    
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
        userTokenFileExists,
        userTokenFileContent: userTokenFileContent ? {
          hasAccessToken: !!userTokenFileContent.access_token,
          hasRefreshToken: !!userTokenFileContent.refresh_token,
          expiresAt: userTokenFileContent.expires_at ? new Date(userTokenFileContent.expires_at).toISOString() : null,
          isExpired: userTokenFileContent.expires_at ? Date.now() > userTokenFileContent.expires_at : null
        } : null
      },
      
      tokens: {
        userTokens: userTokens ? {
          hasAccessToken: !!userTokens.access_token,
          hasRefreshToken: !!userTokens.refresh_token,
          expiresAt: userTokens.expires_at ? new Date(userTokens.expires_at).toISOString() : null,
          isExpired: userTokens.expires_at ? Date.now() > userTokens.expires_at : null
        } : null,
        oauthTempTokens: oauthTempTokens ? {
          hasAccessToken: !!oauthTempTokens.access_token,
          hasRefreshToken: !!oauthTempTokens.refresh_token,
          expiresAt: oauthTempTokens.expires_at ? new Date(oauthTempTokens.expires_at).toISOString() : null
        } : null
      },
      
      authentication: {
        reason: authResult.reason,
        hasYf: !!authResult.yf,
        hasAccess: !!authResult.access,
        accessTokenPreview: authResult.access ? authResult.access.slice(0, 8) + '...' : null
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
