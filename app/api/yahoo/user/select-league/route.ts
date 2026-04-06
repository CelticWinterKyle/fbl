import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { addUserLeague, removeUserLeague, saveMyTeam } from "@/lib/tokenStore/index";
import { getYahooAuthedForUser } from "@/lib/yahoo";

// ─── Auto-detect which team in a league belongs to the signed-in Yahoo user ───

async function autoDetectMyTeam(
  userId: string,
  leagueKey: string
): Promise<{ teamKey: string; teamName: string } | null> {
  try {
    const { yf, access } = await getYahooAuthedForUser(userId);
    if (!yf || !access) return null;

    // Fetch all the user's NFL teams across all seasons
    const resp = await fetch(
      "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_codes=nfl/teams?format=json",
      {
        headers: {
          Authorization: `Bearer ${access}`,
          Accept: "application/json",
        },
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json();

    // Walk the response to collect all user-owned teams
    const fc = data?.fantasy_content;
    const userArr = fc?.users?.["0"]?.user;
    const userData = Array.isArray(userArr) && userArr.length > 1 ? userArr[1] : null;
    if (!userData?.games) return null;

    for (const gameIdx of Object.keys(userData.games).filter((k) => k !== "count")) {
      const gameData = userData.games[gameIdx];
      if (!Array.isArray(gameData?.game) || gameData.game.length < 2) continue;
      const content = gameData.game[1];
      if (!content?.teams) continue;

      for (const teamIdx of Object.keys(content.teams).filter((k) => k !== "count")) {
        const teamArr = content.teams[teamIdx]?.team;
        if (!Array.isArray(teamArr)) continue;
        const info = teamArr[0];
        const teamKey: string = Array.isArray(info)
          ? info.find((x: any) => x?.team_key)?.team_key ?? ""
          : info?.team_key ?? "";
        const teamName: string = Array.isArray(info)
          ? info.find((x: any) => x?.name)?.name ?? "My Team"
          : info?.name ?? "My Team";

        if (teamKey && teamKey.startsWith(leagueKey + ".t.")) {
          await saveMyTeam(userId, "yahoo", { teamKey, teamName }, leagueKey);
          return { teamKey, teamName };
        }
      }
    }
  } catch (e) {
    console.error("[select-league] auto-detect error:", (e as any)?.message);
  }
  return null;
}

// ─── POST — add a league ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const league_key = body.league_key || body.leagueKey;
  if (!league_key || typeof league_key !== "string") {
    return NextResponse.json({ ok: false, error: "missing_league_key" }, { status: 400 });
  }

  await addUserLeague(userId, league_key);

  // Try to auto-detect which team in this league is the user's
  const myTeam = await autoDetectMyTeam(userId, league_key);

  return NextResponse.json({ ok: true, league_key, myTeam });
}

// ─── DELETE — remove a league ─────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const league_key = body.league_key || body.leagueKey;
  if (!league_key || typeof league_key !== "string") {
    return NextResponse.json({ ok: false, error: "missing_league_key" }, { status: 400 });
  }

  await removeUserLeague(userId, league_key);
  return NextResponse.json({ ok: true, league_key });
}
