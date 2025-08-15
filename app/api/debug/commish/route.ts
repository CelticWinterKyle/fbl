export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { readTokens } from "@/lib/tokenStore";
import { getYahoo } from "@/lib/yahoo";

export async function GET() {
  try {
    const { access_token } = readTokens();
    if (!access_token) return NextResponse.json({ error: "Not connected" }, { status: 401 });

    const yf: any = getYahoo(access_token);
    const gm = await yf.game.meta("nfl");
    const gameKey = Array.isArray(gm) ? gm[0]?.game_key : gm?.game_key;
    const leagueKey = `${gameKey}.l.${process.env.YAHOO_LEAGUE_ID}`;

    const tx = await yf.league.transactions(leagueKey);
    const list = (tx?.transactions ?? tx?.league?.transactions ?? [])
      .filter((t:any)=> (t.type||"").toLowerCase()==="commish")
      .slice(0,5);

    const out = list.map((t:any)=>({
      keys: Object.keys(t),
      // common text fields Yahoo might use for Commish Updates:
      type: t.type,
      status: t.status,
      note: t.note || "",
      message: t.message || "",
      comments: t.comments || "",
      title: t.title || "",
      description: t.description || "",
      draft_date: t.draft_date || t.draft_time || "",
      deadline: t.deadline || t.trade_deadline || t.waiver_deadline || "",
      raw_players: Array.isArray(t.players) ? t.players.slice(0,3) : [],
    }));
    return NextResponse.json(out, { status: 200 });
  } catch (e:any) {
    return NextResponse.json({ error: String(e?.message||e) }, { status: 500 });
  }
}
