import { NextRequest, NextResponse } from "next/server";
import { getUserId, USER_COOKIE } from "@/lib/userSession";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const uid = getUserId(req);
  const res = NextResponse.json({ ok:true, disconnected: !!uid });
  if (uid) {
    const dir = path.join(process.cwd(), "lib", "yahoo-users");
    try { fs.unlinkSync(path.join(dir, `${uid}.json`)); } catch {}
    try { fs.unlinkSync(path.join(dir, `${uid}.league.json`)); } catch {}
    res.cookies.set({ name: USER_COOKIE, value: '', path: '/', maxAge: 0 });
  }
  return res;
}
