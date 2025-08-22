import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";

// Use same directory logic as token store for consistency
function getLeagueDir(): string {
  if (process.env.YAHOO_TOKEN_DIR) return process.env.YAHOO_TOKEN_DIR;
  // Detect serverless environments more reliably
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.cwd().startsWith("/var/task")) {
    return "/tmp/yahoo-users";
  }
  return path.join(process.cwd(), "lib", "yahoo-users");
}

function ensureDir() { 
  const dir = getLeagueDir();
  try { 
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`[League] Created directory: ${dir}`);
    }
  } catch (e) {
    console.error(`[League] Failed to create directory ${dir}:`, e);
  }
}

function leagueFile(userId: string) {
  ensureDir();
  const dir = getLeagueDir();
  return path.join(dir, `${userId}.league.json`);
}

// Cookie-based league storage for Vercel
function readLeagueFromCookie(req?: NextRequest): string | null {
  if (!req) return null;
  try {
    const cookie = req.cookies.get('fbl_league');
    return cookie?.value || null;
  } catch {
    return null;
  }
}

export function readUserLeague(userId: string, req?: NextRequest): string | null {
  // First try cookie-based storage (for Vercel)
  if (req) {
    const cookieLeague = readLeagueFromCookie(req);
    if (cookieLeague) {
      console.log(`[UserLeague] Found league ${cookieLeague} in cookie for userId ${userId}`);
      return cookieLeague;
    }
  }

  // Then try file-based storage
  try { 
    const league = fs.readFileSync(leagueFile(userId), "utf8").trim() || null;
    if (league) return league;
  } catch { 
    // If primary userId doesn't work, try to find any league file in the directory
    try {
      ensureDir();
      const dir = getLeagueDir();
      const files = fs.readdirSync(dir);
      const leagueFiles = files.filter(f => f.endsWith('.league.json'));
      
      // Try to read the first league file we find
      for (const file of leagueFiles) {
        try {
          const content = fs.readFileSync(path.join(dir, file), "utf8").trim();
          if (content) {
            console.log(`[UserLeague] Found league ${content} in file ${file} for userId ${userId}`);
            return content;
          }
        } catch { continue; }
      }
    } catch { /* ignore directory errors */ }
  }
  return null;
}

export function saveUserLeague(userId: string, leagueKey: string) {
  fs.writeFileSync(leagueFile(userId), leagueKey);
  return leagueKey;
}

export function deleteUserLeague(userId: string) {
  try { fs.unlinkSync(leagueFile(userId)); } catch {}
}
