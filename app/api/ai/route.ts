import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getYahooAuthed } from "@/lib/yahoo";

export const runtime = "nodejs"; // server runtime
export const dynamic = "force-dynamic";

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

function safe<T>(p: Promise<T>): Promise<T | null> {
  return p.then(x => x as any).catch(() => null);
}

export async function POST(req: NextRequest) {
  const { intent = "summary", week, league_key } = await req.json().catch(() => ({}));

  const { yf, reason } = await getYahooAuthed();
  if (!yf) {
    return NextResponse.json({ ok: false, error: reason || "not_authed" }, { status: 200 });
  }

  if (!league_key) {
    return NextResponse.json({ ok:false, error: "missing_league_key" }, { status: 400 });
  }
  const leagueKey = league_key;

  // Fetch a small, AI-friendly snapshot (keep it tight to control tokens/cost)
  const [meta, standingsRaw, scoreboardRaw, transactionsRaw] = await Promise.all([
    safe(yf.league.meta(leagueKey)),
    safe(yf.league.standings(leagueKey)),
    safe(yf.league.scoreboard(leagueKey, week ? { week } : undefined as any)),
    safe(yf.league.transactions(leagueKey)),
  ]) as any[]; // loose typing for external SDK objects

  const standings: any = standingsRaw || null;
  const scoreboard: any = scoreboardRaw || null;
  const transactions: any = transactionsRaw || null;

  // Normalize minimal data
  const teams = (standings?.standings?.teams ?? standings?.teams ?? [])
    .map((t: any) => ({
      name: t.name || t.team_name,
      owner: t.managers?.[0]?.nickname || t.managers?.[0]?.manager?.nickname || "Owner",
      w: +t?.standings?.outcome_totals?.wins || +t?.outcome_totals?.wins || 0,
      l: +t?.standings?.outcome_totals?.losses || +t?.outcome_totals?.losses || 0,
      pf: +(t?.standings?.points_for ?? t?.points_for ?? 0),
    }));

  const matchups = (scoreboard?.matchups ?? scoreboard?.scoreboard?.matchups ?? [])
    .map((m: any) => {
      const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
      const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
      const name = (t: any) => t?.name || t?.team_name || t?.team?.name || "—";
      const pts  = (t: any) => Number(t?.points ?? t?.team_points?.total ?? 0);
      return { a: { name: name(a), pts: pts(a) }, b: { name: name(b), pts: pts(b) } };
    });

  const commishLines: string[] = (transactions?.transactions ?? [])
    .map((t: any) => ({
      type: (t.type || t.transaction_type || "").toString().toLowerCase(),
      sub: (t.subtype || "").toString().toLowerCase(),
      text: (t.note || t.message || t.comments || t.title || t.description || t.commish_notes || t.commish_note || "").toString().trim()
    }))
    .filter((x: any) => x.text && (x.type.includes("commish") || x.sub.includes("commish") || x.type === "commissioner"))
    .map((x: any) => x.text);

  const snapshot = {
    season: meta?.season ?? "—",
    scoring: meta?.scoring_type ?? "—",
    week: week ?? scoreboard?.week ?? null,
    teams,
    matchups,
    commishLines: Array.from(new Set(commishLines)).slice(0, 10),
  };

  // Compose a concise prompt
  const system = [
    "You are an assistant generating concise, hype-but-readable NFL fantasy league recaps.",
    "Output at most 5 bullet points. No fluff. No betting language.",
    "Use team names as provided. If no games yet, say so briefly."
  ].join(" ");

  const user = `Make a weekly recap for the "Family Business League".
Here is the league snapshot JSON:
${JSON.stringify(snapshot).slice(0, 12000)}
`;

  const client = getClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: "openai_key_missing" }, { status: 500 });
  }
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 350,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const markdown = resp.choices?.[0]?.message?.content ?? "No recap.";
  return NextResponse.json({ ok: true, markdown, meta: { week: snapshot.week, season: snapshot.season } });
}
