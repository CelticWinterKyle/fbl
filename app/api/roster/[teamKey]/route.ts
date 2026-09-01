import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRosterForUser } from "@/lib/rosterData";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(
  req: NextRequest,
  { params }: { params: { teamKey: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "no_user_id" }, { status: 400 });
  }

  const result = await getRosterForUser(userId, {
    platform: req.nextUrl.searchParams.get("platform"),
    teamKey: params.teamKey,
    leagueKey: req.nextUrl.searchParams.get("leagueKey") ?? undefined,
    requestedWeek: req.nextUrl.searchParams.get("week"),
  });

  if (!result.ok) {
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  }

  const res = NextResponse.json(result);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
