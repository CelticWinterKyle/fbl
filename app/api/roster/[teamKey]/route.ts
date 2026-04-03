import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser, leagueKeyFromTeamKey } from "@/lib/yahoo";
import { forceRefreshTokenForUser } from "@/lib/tokenStore/index";
import { fetchRoster } from "@/lib/adapters/yahoo";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(
  req: NextRequest,
  { params }: { params: { teamKey: string } }
) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, reason: "no_user_id" }, { status: 400 });
  }

  const teamKey = params.teamKey;
  const requestedWeek = req.nextUrl.searchParams.get("week");

  let { access, reason: authReason } = await getYahooAuthedForUser(userId);
  if (!access) {
    return NextResponse.json(
      { ok: false, reason: authReason || "yahoo_auth_failed" },
      { status: 401 }
    );
  }

  const leagueKey = leagueKeyFromTeamKey(teamKey);
  if (!leagueKey) {
    return NextResponse.json({ ok: false, reason: "invalid_team_key" }, { status: 400 });
  }

  const cacheKey = `roster:yahoo:${teamKey}:${requestedWeek ?? "current"}`;

  try {
    const roster = await withCache(cacheKey, TTL.ROSTER, async () => {
      try {
        return await fetchRoster(access!, teamKey, leagueKey, requestedWeek);
      } catch (e: any) {
        // On 401 — attempt token refresh and retry once
        if (String(e?.message).includes("401")) {
          const newToken = await forceRefreshTokenForUser(userId);
          if (newToken && newToken !== access) {
            access = newToken;
            return await fetchRoster(newToken, teamKey, leagueKey, requestedWeek);
          }
        }
        throw e;
      }
    });

    const res = NextResponse.json({
      ok: true,
      teamKey,
      week: roster.week,
      roster: roster.all,    // backward compat key
      players: roster.all,
      starters: roster.starters,
      bench: roster.bench,
      empty: roster.all.length === 0,
    });

    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  } catch (e: any) {
    console.error("[Roster] Error:", e?.message || e);
    return NextResponse.json(
      { ok: false, reason: "fetch_failed", error: e?.message || String(e) },
      { status: 502 }
    );
  }
}
