import { NextRequest, NextResponse } from "next/server";
import { getUserId, USER_COOKIE } from "@/lib/userSession";
import { clearUserTokens, deleteUserLeague } from "@/lib/tokenStore/index";

export async function POST(req: NextRequest) {
  const uid = getUserId(req);
  const res = NextResponse.json({ ok: true, disconnected: !!uid });
  if (uid) {
    await Promise.all([clearUserTokens(uid), deleteUserLeague(uid)]);
    console.log(`[Disconnect] Cleared tokens and league for user ${uid.slice(0, 8)}...`);
    res.cookies.set({ name: USER_COOKIE, value: "", path: "/", maxAge: 0 });
  }
  return res;
}
