// GET  /api/user/theme — current favorite-team theme id (or null)
// POST /api/user/theme — set it ({ team: "kc" } or { team: null } for default)

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getUserTheme, setUserTheme } from "@/lib/tokenStore/index";
import { NFL_TEAMS } from "@/lib/teamThemes";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, team: await getUserTheme(userId) });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let team: string | null = body?.team ? String(body.team) : null;
  // Validate against the known team list; anything else resets to default.
  if (team && !NFL_TEAMS.some((t) => t.id === team)) team = null;

  await setUserTheme(userId, team);
  return NextResponse.json({ ok: true, team });
}
