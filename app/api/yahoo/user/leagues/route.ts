import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
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
    // Wrap in promise to support either callback or promise style from lib
    const gRes = await new Promise<any>(resolve => {
      try {
        const maybe = yf.user.games((err: any, data: any) => {
          if (data) return resolve(data);
          if (err) return resolve({ error: err });
        });
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(resolve).catch((e: any)=>resolve({ error:e }));
        } else if (maybe && maybe.games) {
          resolve(maybe);
        } else {
          // if lib returns nothing we resolve later via callback
          setTimeout(()=>resolve(maybe), 400);
        }
      } catch(e:any) { resolve({ error:e }); }
    });
    if (gRes?.error) throw gRes.error;
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
  console.error('[user/leagues] failure', e);
  const res = NextResponse.json({ ok:false, error: e?.message || 'failed', stack: process.env.NODE_ENV !== 'production' ? e?.stack : undefined }, { status:500 });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  }
}
