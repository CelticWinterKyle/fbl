import { NextResponse } from "next/server";
import { getYahooAuthed } from "@/lib/yahoo";

export async function GET() {
  const { yf, reason } = await getYahooAuthed();
  if (!yf) return NextResponse.json({ ok:false, error: reason || 'not_authed' }, { status: 200 });

  try {
    const gRes = await yf.user.games().catch(()=>null);
    const games = (gRes?.games ?? gRes?.user?.games ?? []).map((g:any)=>g.game || g);
    const out:any[] = [];
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
    return NextResponse.json({ ok:true, games: out });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'fetch_failed' }, { status:500 });
  }
}
