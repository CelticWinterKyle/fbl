import { NextResponse } from "next/server";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";

export const runtime = "nodejs";
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

async function restFetch(token: string, path: string) {
  const url = `https://fantasysports.yahooapis.com/fantasy/v2${path}${path.includes('?') ? '&' : '?'}format=json`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`REST ${r.status}`);
  return r.json();
}

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
  const gameKey = url.searchParams.get('game') || '461';

  // Try SDK first (user.game_teams not always exposed)
  let teamKeys: string[] = [];
  try {
    // Attempt league listing then gather teams? Simpler: fall through to REST
  } catch {}

  if (!teamKeys.length) {
    try {
      const teamsJson = await restFetch(access!, `/users;use_login=1/games;game_keys=${gameKey}/teams`);
      const users = teamsJson?.fantasy_content?.users;
      const user = users?.[0]?.user?.[1];
      const games = user?.games;
      for (const g of games ?? []) {
        const tm = g?.game?.[1]?.teams;
        if (Array.isArray(tm)) {
          for (const entry of tm) {
            const T = entry?.team?.[0];
            const k = T?.team_key || T?.team?.team_key || T?.key;
            if (typeof k === 'string') teamKeys.push(k);
          }
        }
      }
    } catch {}
  }

  const leagueKeys = Array.from(new Set(teamKeys.map(k => k.includes('.t.') ? k.split('.t.')[0] : null).filter(Boolean) as string[]));

  const res = NextResponse.json({ ok: true, game_key: gameKey, team_count: teamKeys.length, teams: teamKeys, derived_league_keys: leagueKeys });
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}
