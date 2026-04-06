import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getYahooAuthedForUser, leagueKeyFromTeamKey } from "@/lib/yahoo";
import { forceRefreshTokenForUser, readEspnConnection, readEspnRelayData } from "@/lib/tokenStore/index";
import { fetchRoster } from "@/lib/adapters/yahoo";
import { fetchEspnRoster, parseEspnRosterFromRaw } from "@/lib/adapters/espn";
import { fetchSleeperRoster } from "@/lib/adapters/sleeper";
import { readSleeperConnection, readEspnConnections } from "@/lib/tokenStore/index";
import { withCache, TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// ─── Helpers to normalise NormalizedPlayer → Player shape MatchupCard expects ─

function normalizedToCard(p: any) {
  return {
    name: p.name,
    position: p.position ?? p.slotPosition,
    team: p.nflTeam,
    actual: p.points ?? 0,
    points: p.points ?? 0,
    projection: p.projectedPoints ?? 0,
    projectedPoints: p.projectedPoints ?? 0,
    kickoffMs: p.kickoffMs ?? p.kickoff_ms ?? null,
    opponent: p.opponent ?? null,
    isHome: p.isHome ?? null,
    status: p.status ?? null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { teamKey: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "no_user_id" }, { status: 400 });
  }

  const teamKey = params.teamKey;
  const platform = req.nextUrl.searchParams.get("platform");
  const leagueKey = req.nextUrl.searchParams.get("leagueKey") ?? undefined;
  const requestedWeek = req.nextUrl.searchParams.get("week");
  const week = requestedWeek ? Number(requestedWeek) : undefined;

  // ─── ESPN ─────────────────────────────────────────────────────────────────

  if (platform === "espn") {
    const leagueId = leagueKey ?? null;
    if (!leagueId) {
      return NextResponse.json({ ok: false, reason: "missing_league_key" }, { status: 400 });
    }

    const espnConns = await readEspnConnections(userId);
    const conn = espnConns.find((c) => c.leagueId === leagueId);
    if (!conn) {
      return NextResponse.json({ ok: false, reason: "espn_not_connected" }, { status: 401 });
    }

    try {
      // Try relay data first (private leagues)
      const relay = await readEspnRelayData(userId, leagueId);
      const RELAY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
      const relayUsable = relay && relay.leagueId === leagueId && Date.now() - relay.synced < RELAY_MAX_AGE_MS;

      let roster;
      if (relayUsable && relay) {
        // Parse roster directly from relay-cached raw ESPN data (no API call needed)
        roster = parseEspnRosterFromRaw(relay.raw, relay.leagueId, teamKey, relay.season, week);
        const all = roster.all.map(normalizedToCard);
        const starters = all.filter((p) => p.position !== "BN" && p.position !== "IR");
        const bench = all.filter((p) => p.position === "BN" || p.position === "IR");

        const res = NextResponse.json({ ok: true, teamKey, week, roster: all, players: all, starters, bench, empty: all.length === 0 });
        res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
        return res;
      }

      // Fall through to direct ESPN API
      const creds = conn.espnS2 || conn.swid || conn.espnToken
        ? { espnS2: conn.espnS2, swid: conn.swid, espnToken: conn.espnToken }
        : undefined;

      roster = await withCache(
        `roster:espn:${leagueId}:${teamKey}:${week ?? "cur"}`,
        TTL.ROSTER,
        () => fetchEspnRoster(leagueId, teamKey, conn.season, week, creds)
      );

      const all = roster.all.map(normalizedToCard);
      const starters = all.filter((p) => p.position !== "BN" && p.position !== "IR");
      const bench = all.filter((p) => p.position === "BN" || p.position === "IR");

      const res = NextResponse.json({ ok: true, teamKey, week, roster: all, players: all, starters, bench, empty: all.length === 0 });
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return res;
    } catch (e: any) {
      console.error("[Roster/ESPN] Error:", e?.message);
      return NextResponse.json({ ok: false, reason: "fetch_failed", error: e?.message }, { status: 502 });
    }
  }

  // ─── Sleeper ──────────────────────────────────────────────────────────────

  if (platform === "sleeper") {
    const leagueId = leagueKey ?? null;
    if (!leagueId) {
      return NextResponse.json({ ok: false, reason: "missing_league_key" }, { status: 400 });
    }

    const conn = await readSleeperConnection(userId);
    if (!conn) {
      return NextResponse.json({ ok: false, reason: "sleeper_not_connected" }, { status: 401 });
    }

    try {
      const roster = await withCache(
        `roster:sleeper:${leagueId}:${teamKey}:${week ?? "cur"}`,
        TTL.ROSTER,
        () => fetchSleeperRoster(leagueId, teamKey, week)
      );

      const all = roster.all.map(normalizedToCard);
      const starters = all.filter((p) => p.position !== "BN" && p.position !== "IR");
      const bench = all.filter((p) => p.position === "BN" || p.position === "IR");

      const res = NextResponse.json({ ok: true, teamKey, week, roster: all, players: all, starters, bench, empty: all.length === 0 });
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return res;
    } catch (e: any) {
      console.error("[Roster/Sleeper] Error:", e?.message);
      return NextResponse.json({ ok: false, reason: "fetch_failed", error: e?.message }, { status: 502 });
    }
  }

  // ─── Yahoo (default) ─────────────────────────────────────────────────────

  let { access, reason: authReason } = await getYahooAuthedForUser(userId);
  if (!access) {
    return NextResponse.json({ ok: false, reason: authReason || "yahoo_auth_failed" }, { status: 401 });
  }

  const yahooLeagueKey = leagueKeyFromTeamKey(teamKey);
  if (!yahooLeagueKey) {
    return NextResponse.json({ ok: false, reason: "invalid_team_key" }, { status: 400 });
  }

  const cacheKey = `roster:yahoo:${teamKey}:${requestedWeek ?? "current"}`;

  try {
    const roster = await withCache(cacheKey, TTL.ROSTER, async () => {
      try {
        return await fetchRoster(access!, teamKey, yahooLeagueKey, requestedWeek);
      } catch (e: any) {
        if (String(e?.message).includes("401")) {
          const newToken = await forceRefreshTokenForUser(userId);
          if (newToken && newToken !== access) {
            access = newToken;
            return await fetchRoster(newToken, teamKey, yahooLeagueKey, requestedWeek);
          }
        }
        throw e;
      }
    });

    const res = NextResponse.json({
      ok: true,
      teamKey,
      week: roster.week,
      roster: roster.all,
      players: roster.all,
      starters: roster.starters,
      bench: roster.bench,
      empty: roster.all.length === 0,
    });

    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e: any) {
    console.error("[Roster/Yahoo] Error:", e?.message || e);
    return NextResponse.json({ ok: false, reason: "fetch_failed", error: e?.message || String(e) }, { status: 502 });
  }
}
