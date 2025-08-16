import { NextResponse } from "next/server";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function restFetch(token: string, path: string) {
  const url = `https://fantasysports.yahooapis.com/fantasy/v2${path}${path.includes("?") ? "&" : "?"}format=json`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`REST ${r.status}`);
  return r.json();
}

function pickLatestNFLGameKey(gamesJson: any): string | null {
  try {
    const users = gamesJson?.fantasy_content?.users;
    if (!Array.isArray(users)) return null;
    const user = users[0]?.user?.[1];
    const games = user?.games;
    if (!Array.isArray(games)) return null;
    let best: { key: string; season: number } | null = null;
    for (const g of games) {
      const item = g?.game?.[0];
      if (!item) continue;
      if (item.code === "nfl" && item.season) {
        const season = Number(item.season);
        const key = item.game_key;
        if (key && (!best || season > best.season)) best = { key, season };
      }
    }
    return best?.key ?? null;
  } catch { return null; }
}

export async function GET(req: Request) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req as any, provisional);
  const { yf, access, reason } = await getYahooAuthedForUser(userId);
  if (reason) {
    const res = NextResponse.json({ ok: false, reason });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  }
  const url = new URL(req.url);
  const gameParam = url.searchParams.get("game");

  // Determine NFL game key
  let gameKey = gameParam || null;
  if (!gameKey) {
    const gamesJson = await restFetch(access!, "/users;use_login=1/games");
    gameKey = pickLatestNFLGameKey(gamesJson);
  }
  if (!gameKey) {
    const res = NextResponse.json({ ok: true, leagues: [], reason: "no_nfl_games" });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  }

  // SDK attempt
  let leagues: any[] | null = null;
  try {
    // @ts-ignore different versions sometimes expose user.game_leagues
    const res: any = yf.user.game_leagues ? await yf.user.game_leagues(gameKey) : null;
    if (Array.isArray(res)) leagues = res;
  } catch {}

  // REST fallback
  if (!leagues || leagues.length === 0) {
    const leaguesJson = await restFetch(access!, `/users;use_login=1/games;game_keys=${gameKey}/leagues`);
    leagues = [];
    try {
      const users = leaguesJson?.fantasy_content?.users;
      const user = users?.[0]?.user?.[1];
      const games = user?.games;
      for (const g of games ?? []) {
        const lg = g?.game?.[1]?.leagues;
        if (Array.isArray(lg)) {
          for (const entry of lg) {
            const L = entry?.league?.[0];
            if (L?.league_key) leagues.push(L);
          }
        }
      }
    } catch {}
  }

  const out = (leagues ?? []).map((L: any) => ({
    league_key: L.league_key,
    league_id: String(L.league_id ?? "").replace(/^0+/, "") || null,
    name: L.name ?? "",
  })).filter(x => x.league_key);

  const res = NextResponse.json({ ok: true, game_key: gameKey, count: out.length, leagues: out });
  provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
  return res;
}
