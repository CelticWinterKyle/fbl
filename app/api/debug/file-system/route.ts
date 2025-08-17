import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  
  // Check what files exist in the yahoo-users directory
  const DIR = process.env.YAHOO_TOKEN_DIR || (process.cwd().startsWith("/var/task") ? "/tmp/yahoo-users" : path.join(process.cwd(), "lib", "yahoo-users"));
  const fallbackDir = "/tmp/yahoo-users";
  
  let files: string[] = [];
  let actualDir = DIR;
  
  try {
    if (fs.existsSync(DIR)) {
      files = fs.readdirSync(DIR);
    } else if (fs.existsSync(fallbackDir)) {
      actualDir = fallbackDir;
      files = fs.readdirSync(fallbackDir);
    }
  } catch (e) {
    // Directory doesn't exist
  }
  
  // Check specific user league file
  const leagueFile = path.join(actualDir, `${userId}.league.json`);
  let leagueContent = null;
  try {
    if (fs.existsSync(leagueFile)) {
      leagueContent = fs.readFileSync(leagueFile, "utf8");
    }
  } catch (e) {
    // File doesn't exist
  }
  
  return NextResponse.json({
    userId,
    actualDir,
    files,
    leagueFile,
    leagueContent,
    fileExists: fs.existsSync(leagueFile)
  });
}
