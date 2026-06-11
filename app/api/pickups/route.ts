// ─── GET /api/pickups ─────────────────────────────────────────────────────────
// Trending waiver adds (global Sleeper data) tagged with availability in the
// caller's leagues. Yahoo + Sleeper availability resolve here (cached per
// league); ESPN comes back null and the client says "check your league".

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTrendingAdds, isAvailableInSleeper, isAvailableInYahoo } from "@/lib/waiverIntel";
import { readUserLeagues, readSleeperLeagues } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_PLAYERS = 12;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  try {
    const [trending, yahooLeagues, sleeperLeagues] = await Promise.all([
      getTrendingAdds(),
      readUserLeagues(userId).catch(() => [] as string[]),
      readSleeperLeagues(userId).catch(() => [] as string[]),
    ]);

    const players = trending.slice(0, MAX_PLAYERS);

    const rows = await Promise.all(
      players.map(async (p) => {
        const availability = await Promise.all([
          ...yahooLeagues.map(async (lk) => ({
            platform: "yahoo" as const,
            leagueId: lk,
            available: await isAvailableInYahoo(userId, lk, p.name),
          })),
          ...sleeperLeagues.map(async (lid) => ({
            platform: "sleeper" as const,
            leagueId: lid,
            available: await isAvailableInSleeper(lid, p.id),
          })),
        ]);
        return { ...p, availability };
      })
    );

    const res = NextResponse.json({ ok: true, players: rows });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e: any) {
    console.error("[pickups] failed:", e?.message);
    return NextResponse.json({ ok: false, error: "Couldn't load pickups right now." }, { status: 502 });
  }
}
