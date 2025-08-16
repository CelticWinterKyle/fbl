import { NextResponse } from "next/server";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // ensure never cached
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function restFetch(token: string, path: string) {
  const url = `https://fantasysports.yahooapis.com/fantasy/v2${path}${path.includes("?") ? "&" : "?"}format=json`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`REST ${r.status}`);
  return r.json();
}

type LeagueOut = { league_key: string; name?: string };

export async function GET(req: Request) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req as any, provisional);
  const { yf, access, reason } = await getYahooAuthedForUser(userId);
  if (reason) {
    const res = NextResponse.json({ ok: false, reason });
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
  }

  const url = new URL(req.url);
  const explicitGame = url.searchParams.get("game");
  const debugFlag = url.searchParams.get("debug") === "1";

  const gameCandidates = explicitGame ? [explicitGame] : ["461", "449", "423"]; // 2024, 2023 alt keys etc.
  const tried: string[] = [];
  let usedGame: string | null = null;
  let foundVia: "sdk" | "rest-leagues" | "rest-teams" | null = null;
  let leagues: LeagueOut[] = [];
  let teamCount = 0;
  let derivedLeagueCount = 0;

  for (const gameKey of gameCandidates) {
    tried.push(gameKey);
    // 1. SDK user.game_leagues
    try {
      // @ts-ignore
      if (yf.user?.game_leagues) {
        const sdkRes: any = await yf.user.game_leagues(gameKey).catch(() => null);
        if (Array.isArray(sdkRes) && sdkRes.length) {
          leagues = sdkRes.map((L: any) => ({ league_key: L.league_key, name: L.name })).filter(l => l.league_key);
          if (leagues.length) { usedGame = gameKey; foundVia = "sdk"; break; }
        }
      }
    } catch { /* swallow */ }

    // 2. REST leagues endpoint
    try {
      const leaguesJson = await restFetch(access!, `/users;use_login=1/games;game_keys=${gameKey}/leagues`).catch(() => null);
      const gathered: LeagueOut[] = [];
      try {
        const users = leaguesJson?.fantasy_content?.users;
        const user = users?.[0]?.user?.[1];
        const games = user?.games;
        for (const g of games ?? []) {
          const lg = g?.game?.[1]?.leagues;
          if (Array.isArray(lg)) {
            for (const entry of lg) {
              const L = entry?.league?.[0];
              if (L?.league_key) gathered.push({ league_key: L.league_key, name: L.name });
            }
          }
        }
      } catch { /* ignore parse */ }
      const uniq = Array.from(new Map(gathered.map(l => [l.league_key, l])).values());
      if (uniq.length) { leagues = uniq; usedGame = gameKey; foundVia = "rest-leagues"; break; }
    } catch { /* ignore */ }

    // 3. REST teams endpoint then derive league keys from team_key pattern
    try {
      const teamsJson = await restFetch(access!, `/users;use_login=1/games;game_keys=${gameKey}/teams`).catch(() => null);
      const foundTeams: string[] = [];
      try {
        const users = teamsJson?.fantasy_content?.users;
        const user = users?.[0]?.user?.[1];
        const games = user?.games;
        for (const g of games ?? []) {
          const tm = g?.game?.[1]?.teams;
            if (Array.isArray(tm)) {
              for (const entry of tm) {
                const T = entry?.team?.[0];
                const teamKey = T?.team_key || T?.team_id || T?.key;
                if (typeof teamKey === 'string') foundTeams.push(teamKey);
              }
            }
        }
      } catch { /* parse ignore */ }
      teamCount = foundTeams.length;
      const leagueKeys = Array.from(new Set(foundTeams.map(k => {
        // pattern: 461.l.12345.t.7 => split at '.t.'
        if (!k.includes('.t.')) return null;
        const [base] = k.split('.t.');
        return base || null;
      }).filter(Boolean) as string[]));
      derivedLeagueCount = leagueKeys.length;
      if (leagueKeys.length) {
        leagues = leagueKeys.map(league_key => ({ league_key }));
        usedGame = gameKey; foundVia = "rest-teams"; break;
      }
    } catch { /* ignore */ }
  }

  const resPayload: any = { ok: true, game_key: usedGame, leagues };
  if (debugFlag) {
    resPayload.debug = { tried, used: usedGame, foundVia, teamCount, derivedLeagueCount };
  }

  const res = NextResponse.json(resPayload);
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
