import { NextResponse, NextRequest } from "next/server";
import { getYahooAuthed } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

async function restFetch(token: string, path: string) {
  const url = `https://fantasysports.yahooapis.com/fantasy/v2${path}${path.includes('?') ? '&' : '?'}format=json`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`REST ${r.status}`);
  return r.json();
}

export async function GET(req: NextRequest) {
  const { userId, created } = getOrCreateUserId(req);
  const { yf, access, reason } = await getYahooAuthed();
  if (reason) {
    const res = NextResponse.json({ ok: false, reason });
    if (created) res.cookies.set({ name: "fbl_uid", value: userId, path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60*60*24*365 });
    return res;
  }

  let guid: string | null = null;
  let nflGames: { game_key: string; season: string }[] = [];
  try {
    // Use games endpoint to list all games and filter nfl
    const gamesJson = await restFetch(access!, '/users;use_login=1/games');
    const users = gamesJson?.fantasy_content?.users;
    const userContainer = users?.[0]?.user;
    if (Array.isArray(userContainer)) {
      const meta = userContainer[0];
      guid = meta?.guid || meta?.user_guid || null;
      const userData = userContainer[1];
      const games = userData?.games;
      for (const g of games ?? []) {
        const G = g?.game?.[0];
        if (G?.code === 'nfl') nflGames.push({ game_key: G.game_key, season: G.season });
      }
    }
  } catch {}

  const res = NextResponse.json({ ok: true, guid, nfl_games: nflGames });
  if (created) res.cookies.set({ name: "fbl_uid", value: userId, path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60*60*24*365 });
  return res;
}
