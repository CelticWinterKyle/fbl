// GET  /api/user/my-team?platform=yahoo  → returns saved team for that platform
// POST /api/user/my-team                 → save { platform, teamKey, teamName }
// DELETE /api/user/my-team?platform=yahoo → clear

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { saveMyTeam, readMyTeam, clearMyTeam } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  const platform = req.nextUrl.searchParams.get("platform");
  if (!platform) return NextResponse.json({ ok: false, error: "missing_platform" }, { status: 400 });

  const team = await readMyTeam(userId, platform);
  const res = NextResponse.json({ ok: true, team });
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}

export async function POST(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  const body = await req.json().catch(() => ({}));
  const { platform, teamKey, teamName } = body ?? {};

  if (!platform || !teamKey || !teamName) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  await saveMyTeam(userId, platform, { teamKey: String(teamKey), teamName: String(teamName) });

  const res = NextResponse.json({ ok: true });
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}

export async function DELETE(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  const platform = req.nextUrl.searchParams.get("platform");
  if (!platform) return NextResponse.json({ ok: false, error: "missing_platform" }, { status: 400 });

  await clearMyTeam(userId, platform);
  const res = NextResponse.json({ ok: true });
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
