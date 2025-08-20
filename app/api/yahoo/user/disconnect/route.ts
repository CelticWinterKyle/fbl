import { NextRequest, NextResponse } from "next/server";
import { getUserId, USER_COOKIE } from "@/lib/userSession";
import fs from "fs";
import path from "path";

// Use same directory logic as token store
function getTokenDir(): string {
  if (process.env.YAHOO_TOKEN_DIR) return process.env.YAHOO_TOKEN_DIR;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.cwd().startsWith("/var/task")) {
    return "/tmp/yahoo-users";
  }
  return path.join(process.cwd(), "lib", "yahoo-users");
}

export async function POST(req: NextRequest) {
  const uid = getUserId(req);
  const res = NextResponse.json({ ok:true, disconnected: !!uid });
  if (uid) {
    const dir = getTokenDir();
    try { 
      fs.unlinkSync(path.join(dir, `${uid}.json`)); 
      console.log(`[Disconnect] Removed tokens for user ${uid.slice(0,8)}...`);
    } catch {}
    try { 
      fs.unlinkSync(path.join(dir, `${uid}.league.json`)); 
      console.log(`[Disconnect] Removed league for user ${uid.slice(0,8)}...`);
    } catch {}
    res.cookies.set({ name: USER_COOKIE, value: '', path: '/', maxAge: 0 });
  }
  return res;
}
