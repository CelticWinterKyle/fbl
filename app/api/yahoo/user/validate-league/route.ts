import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { saveUserLeague } from "@/lib/userLeagueStore";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  let body: any = {};
  try { body = await req.json(); } catch {}
  const league_key = (body.league_key || body.leagueKey || "").trim();
  if (!league_key) return NextResponse.json({ ok:false, error:"missing_league_key" }, { status:400 });
  const { yf, reason } = await getYahooAuthedForUser(userId);
  if (!yf) return NextResponse.json({ ok:false, error: reason || 'not_authed' }, { status:403 });
  try {
    const meta = await new Promise<any>((resolve) => {
      try {
        const maybe = yf.league.meta(league_key, (err:any, data:any) => {
          if (data) return resolve(data);
          if (err) return resolve({ _err: err });
        });
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(resolve).catch((e:any)=>resolve({ _err:e }));
        } else if (maybe) {
          resolve(maybe);
        }
      } catch(e:any) { resolve({ _err: e }); }
    });
    if (meta?._err) throw meta._err;
    if (!meta || (!meta.league && !meta.league_id && !meta.name)) {
      return NextResponse.json({ ok:false, error:"invalid_league_key" }, { status:400 });
    }
    saveUserLeague(userId, league_key);
    const res = NextResponse.json({ ok:true, league_key, name: meta?.name || meta?.league?.name || null });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  } catch(e:any) {
    return NextResponse.json({ ok:false, error: e?.message || 'validation_failed' }, { status:500 });
  }
}
