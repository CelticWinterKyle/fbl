// ─── POST /api/recap/narrative ────────────────────────────────────────────────
// Coach's weekly recap for ONE league (docs/AI_COACH_PLAN.md #1): a headline
// plus one punchy line per matchup, written by AI from real scores/records.
// Generated on demand by the first league member to open /recap after finals,
// then cached GLOBALLY per league+week so everyone else (and every later
// view) is free. Generation is gated to Tue/Wed ET (after MNF, before the
// platforms roll to the next week); cached narratives are served any time.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { chatCompletion } from "@/lib/openai";
import { withCache } from "@/lib/cache";
import { checkAndSpendAiBudget, AiBudgetExhaustedError } from "@/lib/aiBudget";
import { checkUserRateLimit } from "@/lib/rateLimit";
import { getYahooData, getSleeperData, getEspnData, isError, type PlatformLeagueData } from "@/lib/leagueData";
import { readEspnConnections } from "@/lib/tokenStore/index";
import { isRecapNarrativeWindow } from "@/lib/pushDetect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLATFORMS = new Set(["yahoo", "sleeper", "espn"]);
const RECAP_TTL_S = 8 * 24 * 3600; // outlives the week; key rotates weekly anyway

type CoachRecap = {
  headline: string;
  lines: { id: string; text: string }[];
};

/** Thrown inside the cache fetcher when generation is not allowed yet. */
class NotFinalError extends Error {
  constructor() {
    super("not_final");
    this.name = "NotFinalError";
  }
}

function matchupFacts(league: PlatformLeagueData): string[] {
  const recordOf = (name: string): string => {
    const t = league.teams.find((t) => t.name === name);
    return t ? ` (${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""})` : "";
  };
  return league.matchups.map((m, i) => {
    const a = m.teamA;
    const b = m.teamB;
    return `${i}: "${a.name}"${recordOf(a.name)} ${a.points.toFixed(1)} vs "${b.name}"${recordOf(b.name)} ${b.points.toFixed(1)}`;
  });
}

/** Pre-compute the week's superlatives so the model cites real ones. */
function weekNotes(league: PlatformLeagueData): string[] {
  if (league.matchups.length === 0) return [];
  let blowout = { i: 0, margin: -1 };
  let closest = { i: 0, margin: Number.POSITIVE_INFINITY };
  let top = { name: "", pts: -1 };
  for (let i = 0; i < league.matchups.length; i++) {
    const m = league.matchups[i];
    const margin = Math.abs(m.teamA.points - m.teamB.points);
    if (margin > blowout.margin) blowout = { i, margin };
    if (margin < closest.margin) closest = { i, margin };
    for (const t of [m.teamA, m.teamB]) {
      if (t.points > top.pts) top = { name: t.name, pts: t.points };
    }
  }
  return [
    `Biggest blowout: matchup ${blowout.i}, margin ${blowout.margin.toFixed(1)}.`,
    `Closest game: matchup ${closest.i}, margin ${closest.margin.toFixed(1)}.`,
    `Top score: "${top.name}" with ${top.pts.toFixed(1)}.`,
  ];
}

async function generateRecap(league: PlatformLeagueData): Promise<CoachRecap> {
  const budget = await checkAndSpendAiBudget(2000);
  if (!budget.allowed) throw new AiBudgetExhaustedError();

  const systemPrompt = [
    'You are "Coach", the resident analyst writing a weekly fantasy football league recap.',
    "Tone: punchy, lightly trash-talky, family friendly. Celebrate the big winner, needle the big loser gently.",
    "Use ONLY the team names, scores, records, and notes provided. Never invent players, injuries, stats, or storylines you cannot see in the data.",
    'Respond with ONLY a JSON object: {"headline": string, "lines": [{"i": number, "text": string}]}.',
    "headline: one sentence capturing the week, fifteen words max. lines: EXACTLY one entry per matchup index shown, each one sentence of twenty words max citing the actual score or margin.",
    "No markdown, no emojis, no em dashes.",
  ].join(" ");

  const userPrompt = [
    `League: "${league.leagueName}" (${league.platform}), week ${league.currentWeek}, ${league.season} season, ${league.teams.length} teams.`,
    "",
    "Matchups (index: teams, records, final scores):",
    ...matchupFacts(league),
    "",
    ...weekNotes(league),
  ].join("\n");

  const aiRes = await chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    logTag: "recap-narrative",
  });

  const raw = aiRes.choices?.[0]?.message?.content;
  if (!raw) throw new Error("empty_ai_response");
  const parsed = JSON.parse(raw);

  const lines: { id: string; text: string }[] = [];
  const fromAi = Array.isArray(parsed.lines) ? parsed.lines : [];
  for (const entry of fromAi) {
    const i = Number(entry?.i);
    const text = typeof entry?.text === "string" ? entry.text.trim().slice(0, 220) : "";
    const m = Number.isInteger(i) ? league.matchups[i] : undefined;
    if (!m || !text) continue;
    if (lines.some((l) => l.id === m.id)) continue; // one line per matchup
    lines.push({ id: m.id, text });
  }
  const headline = String(parsed.headline ?? "").trim().slice(0, 180);
  if (!headline || lines.length === 0) throw new Error("malformed_ai_response");
  return { headline, lines };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const b = body as Record<string, unknown> | null;
  const platform = typeof b?.platform === "string" ? b.platform : "";
  const leagueId = typeof b?.leagueId === "string" ? b.leagueId.slice(0, 64) : "";
  const week = Number(b?.week);
  if (!PLATFORMS.has(platform) || !leagueId || !Number.isInteger(week) || week < 1 || week > 23) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  // Cache hits are the common case; the limit only meters generation attempts
  // (someone hammering cold keys across many leagues).
  const allowed = await checkUserRateLimit(userId, "recap-narrative", 10, 3600);
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  try {
    const recap = await withCache<CoachRecap>(
      `ai:recap:v1:${platform}:${leagueId}:${week}`,
      RECAP_TTL_S,
      async () => {
        // Generation gate (cached recaps skip this entirely): only between
        // MNF wrap-up and the platforms rolling to the next week.
        if (!isRecapNarrativeWindow()) throw new NotFinalError();

        const outcome =
          platform === "yahoo"
            ? await getYahooData(userId, leagueId)
            : platform === "sleeper"
              ? await getSleeperData(leagueId)
              : await (async () => {
                  const conn = (await readEspnConnections(userId)).find((c) => c.leagueId === leagueId);
                  return conn ? getEspnData(conn, undefined, userId) : null;
                })();
        if (!outcome || isError(outcome)) throw new Error("league_unavailable");

        // The fetchers only return the platform's CURRENT week; refuse to
        // cache a narrative under a week label the data does not match.
        if (outcome.currentWeek !== week) throw new NotFinalError();
        // Every matchup must have actually been played (mirrors the finals
        // check in push-dispatch) so a half-finished week is never cached.
        if (
          outcome.matchups.length === 0 ||
          !outcome.matchups.every((m) => Math.max(m.teamA.points, m.teamB.points) > 0)
        ) {
          throw new NotFinalError();
        }

        return generateRecap(outcome);
      }
    );
    return NextResponse.json({ ok: true, ...recap });
  } catch (e: any) {
    if (e instanceof NotFinalError) {
      return NextResponse.json({ ok: false, error: "not_final" }, { status: 409 });
    }
    if (e instanceof AiBudgetExhaustedError) {
      return NextResponse.json(
        { ok: false, error: "budget_exhausted", message: "AI is taking a breather. Try again tomorrow." },
        { status: 429 }
      );
    }
    console.error("[recap-narrative] failed:", e?.message || e);
    return NextResponse.json({ ok: false, error: "recap_failed" }, { status: 502 });
  }
}
