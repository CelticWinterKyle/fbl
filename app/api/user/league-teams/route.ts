// GET /api/user/league-teams?platform=yahoo&leagueId=XXX
// Returns the list of teams in a given league so the user can pick their own.

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { readSleeperConnection, readEspnConnection } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TeamEntry = { teamKey: string; teamName: string; ownerName?: string };

// ─── Yahoo ────────────────────────────────────────────────────────────────────

async function getYahooTeams(userId: string, leagueKey: string): Promise<TeamEntry[]> {
  const { yf } = await getYahooAuthedForUser(userId);
  if (!yf) throw new Error("not_authed");

  const raw = await yf.league.standings(leagueKey).catch(() => null);
  const teamsSource: any[] =
    raw?.standings?.teams ?? raw?.teams ?? [];

  if (!teamsSource.length) {
    const fallback = await yf.league.teams(leagueKey).catch(() => null);
    const arr = fallback?.teams ?? fallback?.league?.teams ?? [];
    return arr.map((t: any) => ({
      teamKey: t.team_key ?? "",
      teamName: t.name ?? t.team_name ?? "Team",
      ownerName: t.managers?.[0]?.nickname ?? t.managers?.[0]?.manager?.nickname,
    })).filter((t: TeamEntry) => !!t.teamKey);
  }

  return teamsSource.map((t: any) => ({
    teamKey: t.team_key ?? "",
    teamName: t.name ?? t.team_name ?? "Team",
    ownerName: t.managers?.[0]?.nickname ?? t.managers?.[0]?.manager?.nickname,
  })).filter((t: TeamEntry) => !!t.teamKey);
}

// ─── Sleeper ──────────────────────────────────────────────────────────────────

async function getSleeperTeams(leagueId: string, sleeperId: string): Promise<TeamEntry[]> {
  const [rostersRes, usersRes] = await Promise.all([
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`).then(r => r.json()).catch(() => []),
    fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`).then(r => r.json()).catch(() => []),
  ]);

  const rosters: any[] = Array.isArray(rostersRes) ? rostersRes : [];
  const users: any[] = Array.isArray(usersRes) ? usersRes : [];

  const userMap = new Map<string, string>();
  users.forEach((u: any) => {
    if (u.user_id) userMap.set(u.user_id, u.display_name ?? u.username ?? u.user_id);
  });

  return rosters.map((r: any) => {
    const ownerId: string = r.owner_id ?? "";
    const displayName = userMap.get(ownerId) ?? ownerId;
    const teamName = r.metadata?.team_name ?? `Team ${r.roster_id}`;
    return {
      teamKey: String(r.roster_id),
      teamName,
      ownerName: displayName,
    };
  });
}

// ─── ESPN ─────────────────────────────────────────────────────────────────────

async function getEspnTeams(leagueId: string, season: number, espnS2?: string, swid?: string): Promise<TeamEntry[]> {
  const headers: Record<string, string> = {};
  if (espnS2 && swid) {
    headers["Cookie"] = `espn_s2=${espnS2}; SWID=${swid}`;
  }

  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=mTeam`;
  const res = await fetch(url, { headers }).catch(() => null);
  if (!res?.ok) return [];

  const data = await res.json().catch(() => null);
  const teams: any[] = data?.teams ?? [];

  return teams.map((t: any) => ({
    teamKey: String(t.id),
    teamName: `${t.location ?? ""} ${t.nickname ?? ""}`.trim() || `Team ${t.id}`,
    ownerName: t.primaryOwner,
  }));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  const platform = req.nextUrl.searchParams.get("platform");
  const leagueId = req.nextUrl.searchParams.get("leagueId");

  if (!platform || !leagueId) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  try {
    let teams: TeamEntry[] = [];

    if (platform === "yahoo") {
      teams = await getYahooTeams(userId, leagueId);
    } else if (platform === "sleeper") {
      const conn = await readSleeperConnection(userId);
      if (!conn) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });
      teams = await getSleeperTeams(leagueId, conn.sleeperId);
    } else if (platform === "espn") {
      const conn = await readEspnConnection(userId);
      if (!conn) return NextResponse.json({ ok: false, error: "not_connected" }, { status: 401 });
      teams = await getEspnTeams(leagueId, conn.season, conn.espnS2, conn.swid);
    } else {
      return NextResponse.json({ ok: false, error: "unknown_platform" }, { status: 400 });
    }

    const res = NextResponse.json({ ok: true, teams });
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
  } catch (e: any) {
    console.error("[league-teams]", e?.message);
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch_failed" }, { status: 500 });
  }
}
