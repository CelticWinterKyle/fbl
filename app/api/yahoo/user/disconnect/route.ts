import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { clearUserTokens, deleteUserLeague } from "@/lib/tokenStore/index";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await Promise.all([clearUserTokens(userId), deleteUserLeague(userId)]);
  console.log(`[Disconnect] Cleared tokens and league for user ${userId.slice(0, 8)}...`);
  return NextResponse.json({ ok: true, disconnected: true });
}
