// GET  /api/user/commissioner?platform=yahoo&leagueId=XXX  → { ok, isCommissioner }
// POST /api/user/commissioner  { platform, leagueId, value }

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { setCommissioner, isCommissioner } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set(["yahoo", "sleeper", "espn"]);
const LEAGUE_ID_RE = /^[a-zA-Z0-9_.-]+$/;

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const platform = req.nextUrl.searchParams.get("platform") ?? "";
  const leagueId = req.nextUrl.searchParams.get("leagueId") ?? "";
  if (!PLATFORMS.has(platform) || !LEAGUE_ID_RE.test(leagueId)) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const value = await isCommissioner(userId, platform, leagueId);
  return NextResponse.json({ ok: true, isCommissioner: value });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const platform = typeof body?.platform === "string" ? body.platform : "";
  const leagueId = typeof body?.leagueId === "string" ? body.leagueId : "";
  const value = body?.value;

  if (!PLATFORMS.has(platform) || !LEAGUE_ID_RE.test(leagueId) || typeof value !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  await setCommissioner(userId, platform, leagueId, value);
  return NextResponse.json({ ok: true, isCommissioner: value });
}
