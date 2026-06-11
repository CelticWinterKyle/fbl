// ─── POST /api/analyze-trade ──────────────────────────────────────────────────
// AI verdict on a proposed trade (SEASON_FEATURES_PLAN.md #6). The caller
// picks players to give and receive between their team and another team in
// the same league; we ground the prompt in both rosters' real stats and ask
// for a structured verdict. Rate limited and budgeted like the other AI
// routes; identical proposals share a 1h cache.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { chatCompletion } from "@/lib/openai";
import { withCache } from "@/lib/cache";
import { checkAndSpendAiBudget, AiBudgetExhaustedError } from "@/lib/aiBudget";
import { checkUserRateLimit } from "@/lib/rateLimit";
import { getRosterForUser } from "@/lib/rosterData";
import { playerNameKey } from "@/lib/playerName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PLATFORMS = new Set(["yahoo", "sleeper", "espn"]);

type TradeVerdict = {
  verdict: "accept" | "reject" | "fair";
  fairness: number; // 1-10, 10 = perfectly even
  summary: string;
  reasoning: string;
  lineupImpact: string;
};

function cleanNames(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > 5) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") return null;
    const s = item.trim().slice(0, 60);
    if (!s) return null;
    out.push(s);
  }
  return out;
}

type RosterPlayer = { name: string; position: string; team: string; points: number; projection: number };

function describe(players: RosterPlayer[]): string {
  return players
    .map(
      (p) =>
        `${p.name} (${p.position}, ${p.team || "FA"}, ${p.points.toFixed(1)} pts this week, ${p.projection.toFixed(1)} proj)`
    )
    .join("; ");
}

function pickFromRoster(roster: any, names: string[]): RosterPlayer[] | null {
  const all: any[] = [
    ...(Array.isArray(roster?.starters) ? roster.starters : []),
    ...(Array.isArray(roster?.bench) ? roster.bench : []),
  ];
  const byKey = new Map<string, any>();
  for (const p of all) {
    if (typeof p?.name === "string") byKey.set(playerNameKey(p.name), p);
  }
  const picked: RosterPlayer[] = [];
  for (const name of names) {
    const p = byKey.get(playerNameKey(name));
    if (!p) return null; // named player not on that roster
    picked.push({
      name: p.name,
      position: String(p.position ?? ""),
      team: String(p.team ?? ""),
      points: Number(p.points ?? 0),
      projection: Number(p.projection ?? p.projectedPoints ?? 0),
    });
  }
  return picked;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const b = body as Record<string, unknown> | null;
  const platform = typeof b?.platform === "string" ? b.platform : "";
  const leagueKey = typeof b?.leagueKey === "string" ? b.leagueKey.slice(0, 64) : "";
  const myTeamKey = typeof b?.myTeamKey === "string" ? b.myTeamKey.slice(0, 64) : "";
  const theirTeamKey = typeof b?.theirTeamKey === "string" ? b.theirTeamKey.slice(0, 64) : "";
  const give = cleanNames(b?.give);
  const get = cleanNames(b?.get);

  if (!PLATFORMS.has(platform) || !leagueKey || !myTeamKey || !theirTeamKey || !give || !get) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  const allowed = await checkUserRateLimit(userId, "analyze-trade", 10, 3600);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Trade analysis limit reached (10/hr). Try again later." },
      { status: 429 }
    );
  }

  try {
    const [mine, theirs] = await Promise.all([
      getRosterForUser(userId, { platform: platform as any, teamKey: myTeamKey, leagueKey, requestedWeek: null }),
      getRosterForUser(userId, { platform: platform as any, teamKey: theirTeamKey, leagueKey, requestedWeek: null }),
    ]);
    if (!(mine as any)?.ok || !(theirs as any)?.ok) {
      return NextResponse.json({ ok: false, error: "rosters_unavailable" }, { status: 502 });
    }

    const giving = pickFromRoster(mine, give);
    const getting = pickFromRoster(theirs, get);
    if (!giving || !getting) {
      return NextResponse.json(
        { ok: false, error: "player_not_on_roster", message: "One of those players is not on the selected roster." },
        { status: 400 }
      );
    }

    // Identical proposals (either direction of the same league) share a verdict.
    const hash = crypto
      .createHash("sha1")
      .update([platform, leagueKey, ...give.map(playerNameKey).sort(), "|", ...get.map(playerNameKey).sort()].join(","))
      .digest("hex")
      .slice(0, 16);

    const verdict = await withCache<TradeVerdict>(`ai:trade:${hash}`, 3600, async () => {
      const budget = await checkAndSpendAiBudget(1500);
      if (!budget.allowed) throw new AiBudgetExhaustedError();

      const systemPrompt = [
        "You are a sharp, blunt fantasy football trade analyst.",
        "Evaluate the trade from MY TEAM's perspective using season-long value, positional scarcity, and the stats provided.",
        'Respond with ONLY a JSON object: {"verdict": "accept"|"reject"|"fair", "fairness": 1-10, "summary": string, "reasoning": string, "lineupImpact": string}.',
        "fairness: 10 means perfectly even, 1 means a total fleecing (of either side).",
        "summary: one punchy sentence. reasoning: two to four sentences. lineupImpact: one or two sentences on what my starting lineup looks like after.",
        "No markdown, no emojis, no em dashes.",
      ].join(" ");

      const userPrompt = [
        `League platform: ${platform}.`,
        `MY TEAM gives: ${describe(giving)}.`,
        `MY TEAM receives: ${describe(getting)}.`,
        "Note: points/projections are from the most recent scored week; weigh rest-of-season value, not just one week.",
      ].join("\n");

      const aiRes = await chatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        logTag: "analyze-trade",
      });

      const raw = aiRes.choices?.[0]?.message?.content;
      if (!raw) throw new Error("empty_ai_response");
      const parsed = JSON.parse(raw);
      const v = String(parsed.verdict ?? "fair").toLowerCase();
      return {
        verdict: v === "accept" || v === "reject" ? (v as "accept" | "reject") : "fair",
        fairness: Math.min(10, Math.max(1, Math.round(Number(parsed.fairness) || 5))),
        summary: String(parsed.summary ?? "").slice(0, 300),
        reasoning: String(parsed.reasoning ?? "").slice(0, 800),
        lineupImpact: String(parsed.lineupImpact ?? "").slice(0, 400),
      };
    });

    return NextResponse.json({ ok: true, ...verdict, give: giving.map((p) => p.name), get: getting.map((p) => p.name) });
  } catch (e: any) {
    if (e instanceof AiBudgetExhaustedError) {
      return NextResponse.json(
        { ok: false, error: "budget", message: "AI budget for today is used up. Try again tomorrow." },
        { status: 429 }
      );
    }
    console.error("[analyze-trade] failed:", e?.message);
    return NextResponse.json({ ok: false, error: "analysis_failed" }, { status: 502 });
  }
}
