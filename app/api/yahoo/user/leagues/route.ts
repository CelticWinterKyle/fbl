import { NextResponse } from "next/server";
import { getUserTeamsNFL } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // ensure never cached
export const revalidate = 0;
export const fetchCache = "force-no-store";

type LeagueOut = { league_key: string };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const res = await getUserTeamsNFL();
  if (!res.ok) {
    return NextResponse.json(debug ? res : { ok: false, reason: res.reason }, { status: 400 });
  }
  return NextResponse.json(debug ? res : {
    ok: true,
    count: res.derived_league_keys.length,
    leagues: res.derived_league_keys,
  });
}
