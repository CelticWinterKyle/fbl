// GET    /api/user/my-team?platform=yahoo&leagueId=XXX  → returns saved team
// POST   /api/user/my-team  { platform, leagueId?, teamKey, teamName }
// DELETE /api/user/my-team?platform=yahoo&leagueId=XXX

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { saveMyTeam, readMyTeam, clearMyTeam } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const platform = req.nextUrl.searchParams.get("platform");
  if (!platform) return NextResponse.json({ ok: false, error: "missing_platform" }, { status: 400 });
  const leagueId = req.nextUrl.searchParams.get("leagueId") ?? undefined;

  const team = await readMyTeam(userId, platform, leagueId);
  return NextResponse.json({ ok: true, team });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { platform, leagueId, teamKey, teamName } = body ?? {};

  if (!platform || !teamKey || !teamName) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  await saveMyTeam(
    userId,
    String(platform),
    { teamKey: String(teamKey), teamName: String(teamName) },
    leagueId ? String(leagueId) : undefined
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const platform = req.nextUrl.searchParams.get("platform");
  if (!platform) return NextResponse.json({ ok: false, error: "missing_platform" }, { status: 400 });
  const leagueId = req.nextUrl.searchParams.get("leagueId") ?? undefined;

  await clearMyTeam(userId, platform, leagueId);
  return NextResponse.json({ ok: true });
}
