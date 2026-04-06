// GET  /api/user/my-team?platform=yahoo  → returns saved team for that platform
// POST /api/user/my-team                 → save { platform, teamKey, teamName }
// DELETE /api/user/my-team?platform=yahoo → clear

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { saveMyTeam, readMyTeam, clearMyTeam } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const platform = req.nextUrl.searchParams.get("platform");
  if (!platform) return NextResponse.json({ ok: false, error: "missing_platform" }, { status: 400 });

  const team = await readMyTeam(userId, platform);
  const res = NextResponse.json({ ok: true, team });
  return res;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { platform, teamKey, teamName } = body ?? {};

  if (!platform || !teamKey || !teamName) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  await saveMyTeam(userId, platform, { teamKey: String(teamKey), teamName: String(teamName) });

  const res = NextResponse.json({ ok: true });
  return res;
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const platform = req.nextUrl.searchParams.get("platform");
  if (!platform) return NextResponse.json({ ok: false, error: "missing_platform" }, { status: 400 });

  await clearMyTeam(userId, platform);
  const res = NextResponse.json({ ok: true });
  return res;
}
