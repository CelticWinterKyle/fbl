import { NextRequest, NextResponse } from "next/server";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";

export async function GET(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  const { yf, reason } = await getYahooAuthedForUser(userId);
  if (!yf) {
    const res = NextResponse.json({ ok:false, error: reason || 'not_authed' });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  }
  const out:any[] = [];
  try {
    const gRes = await yf.user.games().catch(()=>null);
    const games = (gRes?.games ?? gRes?.user?.games ?? []).map((g:any)=>g.game || g);
    if (games.length) {
      for (const g of games) {
        const key = g?.game_key || g?.code || g?.code_and_year || g?.key;
        if (!key) continue;
        const lRes = await yf.user.leagues(key).catch(()=>null);
        const leagues = (lRes?.leagues ?? lRes?.user?.leagues ?? []).map((l:any)=>l.league || l);
        out.push({
          game_key: g?.game_key,
          code: g?.code,
          name: g?.name,
          season: g?.season,
          leagues: leagues.map((l:any)=>({
            name: l?.name,
            league_id: l?.league_id || (l?.league_key ? String(l.league_key).split('.l.')[1] : null),
            league_key: l?.league_key,
          }))
        });
      }
    }
    const res = NextResponse.json({ ok:true, games: out });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  } catch (e:any) {
    const res = NextResponse.json({ ok:false, error: e?.message || 'failed' }, { status:500 });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  }
}
