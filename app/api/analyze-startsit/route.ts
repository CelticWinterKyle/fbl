// ─── POST /api/analyze-startsit ───────────────────────────────────────────────
// Coach's call on a head-to-head start/sit question (docs/AI_COACH_PLAN.md #2),
// grounded in real data, never name-recognition vibes:
//   - both players' actual points over the last 4 completed weeks, in THIS
//     league's scoring (per-week roster fetches, same infra as the trade route)
//   - injury designations, platform projections, bye weeks, starting slots
//   - stadium weather (Open-Meteo) — relevant only at extremes, and the
//     prompt says so
// The verdict must include a calibrated lean, and "coin flip" is a first-class
// answer: most close calls ARE coin flips and the tool says so instead of
// bluffing. Same question + same week = same cached answer (no re-rolling).
// Every unique verdict is appended to the startsit log for post-week scoring.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { chatCompletion } from "@/lib/openai";
import { withCache } from "@/lib/cache";
import { checkAndSpendAiBudget, AiBudgetExhaustedError } from "@/lib/aiBudget";
import { checkUserRateLimit } from "@/lib/rateLimit";
import { getRosterForUser } from "@/lib/rosterData";
import { getYahooData, getSleeperData, getEspnData, isError } from "@/lib/leagueData";
import { readEspnConnections } from "@/lib/tokenStore/index";
import { playerNameKey } from "@/lib/playerName";
import { getNflByeWeeks } from "@/lib/nflSchedule";
import { getWeatherForTeams, type WeatherSnapshot } from "@/lib/weather";
import { recordStartSitVerdict } from "@/lib/startsitLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLATFORMS = new Set(["yahoo", "sleeper", "espn"]);
const FORM_WEEKS = 4;
const LEANS = new Set(["strong", "moderate", "coin flip"]);

type Verdict = {
  pick: string;
  lean: "strong" | "moderate" | "coin flip";
  summary: string;
  reasons: string[];
};

type RosterPlayer = {
  name: string;
  position: string;
  team: string;
  points: number;
  projection: number;
  status: string | null;
};

function toPlayer(p: any): RosterPlayer {
  return {
    name: String(p?.name ?? ""),
    position: String(p?.position ?? ""),
    team: String(p?.team ?? ""),
    points: Number(p?.points ?? 0),
    projection: Number(p?.projection ?? p?.projectedPoints ?? 0),
    status: typeof p?.status === "string" ? p.status : null,
  };
}

function allPlayers(roster: any): RosterPlayer[] {
  return [
    ...(Array.isArray(roster?.starters) ? roster.starters : []),
    ...(Array.isArray(roster?.bench) ? roster.bench : []),
  ]
    .map(toPlayer)
    .filter((p) => p.name);
}

function describePlayer(
  label: string,
  p: RosterPlayer,
  form: number[],
  byes: Record<string, number>,
  currentWeek: number,
  weather: WeatherSnapshot | null
): string {
  const status = p.status && p.status !== "active" ? ` STATUS: ${p.status.toUpperCase()}.` : "";
  const formStr =
    form.length > 0
      ? ` Points in recent weeks (newest first): ${form.map((x) => x.toFixed(1)).join(", ")}.`
      : " No completed-week scoring data available.";
  const proj = p.projection > 0 ? ` This week's projection: ${p.projection.toFixed(1)}.` : "";
  const bye = byes[(p.team || "").toUpperCase()];
  const byeStr =
    typeof bye === "number" && currentWeek > 0
      ? bye === currentWeek
        ? " ON BYE THIS WEEK (cannot play)."
        : bye > currentWeek
          ? ` Bye week ${bye} is later.`
          : ""
      : "";
  const wx = weather ? ` Game-site weather: ${weather.summary}` : "";
  return `${label}: ${p.name} (${p.position}, ${p.team || "FA"}).${status}${formStr}${proj}${byeStr}${wx}`;
}

async function generateVerdict(args: {
  platform: string;
  leagueName: string | null;
  teamCount: number;
  currentWeek: number;
  season: number | null;
  slotLine: string | null;
  descA: string;
  descB: string;
  nameA: string;
  nameB: string;
}): Promise<Verdict> {
  const budget = await checkAndSpendAiBudget(3000);
  if (!budget.allowed) throw new AiBudgetExhaustedError();

  const systemPrompt = [
    'You are "Coach", a veteran fantasy football analyst making a start/sit call between two players on the same roster.',
    "Apply professional start/sit principles in this order:",
    "(1) Availability is absolute: a player who is ON BYE or OUT/IR cannot be started; an OUT/IR/bye player loses automatically and the lean is strong.",
    "(2) Recent actual points in THIS league's scoring beat season-long reputation; the numbers shown are real scored points, newest first.",
    "(3) Projections are a useful tiebreaker when present; a projection of zero or absent means no data, not a zero-point prediction.",
    "(4) Questionable or doubtful designations matter: doubtful is close to out; questionable is a modest downgrade, not a death sentence.",
    "(5) Weather matters ONLY at extremes: sustained wind around 15-20 mph or worse hurts deep passing and kicking; rain alone is mostly noise; indoor games have no weather impact. Never bench a good player over mild weather.",
    "(6) Use your general knowledge of player quality, role, and team context, but NEVER invent specific stats, news, injuries, or matchup numbers you cannot see in the data provided.",
    "CALIBRATION IS THE POINT OF THIS TOOL: when the evidence is genuinely close, the lean MUST be \"coin flip\" and the summary should say so plainly. Do not manufacture confidence. Reserve \"strong\" for availability problems or clear multi-signal gaps.",
    'Respond with ONLY a JSON object: {"pick": string, "lean": "strong"|"moderate"|"coin flip", "summary": string, "reasons": [string, string, string?]}.',
    "pick: EXACTLY one of the two player names as given. summary: one sentence a group chat would quote. reasons: two or three short sentences, each citing specific provided data (points, status, bye, projection, weather).",
    "No markdown, no emojis, no em dashes.",
  ].join(" ");

  const userPrompt = [
    `League: ${args.platform}${args.teamCount ? `, ${args.teamCount} teams` : ""}${args.leagueName ? `, "${args.leagueName}"` : ""}${args.currentWeek ? `, week ${args.currentWeek}` : ""}${args.season ? `, ${args.season} season` : ""}.`,
    args.slotLine,
    "",
    args.descA,
    "",
    args.descB,
    "",
    `Which one starts this week: ${args.nameA} or ${args.nameB}?`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const aiRes = await chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    logTag: "analyze-startsit",
  });

  const raw = aiRes.choices?.[0]?.message?.content;
  if (!raw) throw new Error("empty_ai_response");
  const parsed = JSON.parse(raw);

  // The pick must be one of the two candidates, exactly.
  const pickKey = playerNameKey(String(parsed.pick ?? ""));
  const pick =
    pickKey === playerNameKey(args.nameA) ? args.nameA : pickKey === playerNameKey(args.nameB) ? args.nameB : null;
  if (!pick) throw new Error("malformed_ai_response");

  const leanRaw = String(parsed.lean ?? "").toLowerCase();
  const lean = (LEANS.has(leanRaw) ? leanRaw : "moderate") as Verdict["lean"];
  const reasons = (Array.isArray(parsed.reasons) ? parsed.reasons : [])
    .map((r: unknown) => String(r ?? "").trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 3);
  const summary = String(parsed.summary ?? "").trim().slice(0, 300);
  if (!summary || reasons.length === 0) throw new Error("malformed_ai_response");
  return { pick, lean, summary, reasons };
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const b = body as Record<string, unknown> | null;
  const platform = typeof b?.platform === "string" ? b.platform : "";
  const leagueKey = typeof b?.leagueKey === "string" ? b.leagueKey.slice(0, 64) : "";
  const teamKey = typeof b?.teamKey === "string" ? b.teamKey.slice(0, 64) : "";
  const playerA = typeof b?.playerA === "string" ? b.playerA.trim().slice(0, 60) : "";
  const playerB = typeof b?.playerB === "string" ? b.playerB.trim().slice(0, 60) : "";

  if (!PLATFORMS.has(platform) || !leagueKey || !teamKey || !playerA || !playerB) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  if (playerNameKey(playerA) === playerNameKey(playerB)) {
    return NextResponse.json(
      { ok: false, error: "same_player", message: "Pick two different players." },
      { status: 400 }
    );
  }

  const allowed = await checkUserRateLimit(userId, "analyze-startsit", 15, 3600);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Start/sit limit reached (15/hr). Try again later." },
      { status: 429 }
    );
  }

  try {
    // ── Current roster + league snapshot (slots, week, season, team count) ──
    const leagueSnapshotP = (async () => {
      try {
        if (platform === "yahoo") return await getYahooData(userId, leagueKey);
        if (platform === "sleeper") return await getSleeperData(leagueKey);
        const conn = (await readEspnConnections(userId)).find((c) => c.leagueId === leagueKey);
        return conn ? await getEspnData(conn, undefined, userId) : null;
      } catch {
        return null;
      }
    })();

    const [mine, snapshot] = await Promise.all([
      getRosterForUser(userId, { platform: platform as any, teamKey, leagueKey, requestedWeek: null }),
      leagueSnapshotP,
    ]);
    if (!(mine as any)?.ok) {
      return NextResponse.json({ ok: false, error: "roster_unavailable" }, { status: 502 });
    }

    const pool = allPlayers(mine);
    const byKey = new Map(pool.map((p) => [playerNameKey(p.name), p]));
    const A = byKey.get(playerNameKey(playerA));
    const B = byKey.get(playerNameKey(playerB));
    if (!A || !B) {
      return NextResponse.json(
        { ok: false, error: "player_not_on_roster", message: "One of those players is not on this roster." },
        { status: 400 }
      );
    }

    const league = snapshot && !isError(snapshot) ? snapshot : null;
    const currentWeek = (league?.currentWeek ?? Number((mine as any)?.week)) || 0;
    const season = league?.season ?? null;

    const slotLine =
      league?.rosterPositions && league.rosterPositions.length > 0
        ? `Starting slots: ${league.rosterPositions.map((r) => `${r.position}x${r.count}`).join(", ")}.`
        : null;

    // ── Recent form: both players live on MY roster, so one fetch per week ──
    const wanted = new Set([playerNameKey(A.name), playerNameKey(B.name)]);
    const form = new Map<string, number[]>();
    if (currentWeek > 1) {
      const weeks: number[] = [];
      for (let w = currentWeek - 1; w >= Math.max(1, currentWeek - FORM_WEEKS); w--) weeks.push(w);
      const weekly = await Promise.all(
        weeks.map((w) =>
          getRosterForUser(userId, { platform: platform as any, teamKey, leagueKey, requestedWeek: String(w) }).catch(
            () => null
          )
        )
      );
      for (const result of weekly) {
        if (!(result as any)?.ok) continue;
        for (const raw of allPlayers(result)) {
          const key = playerNameKey(raw.name);
          if (!wanted.has(key)) continue;
          const line = form.get(key) ?? [];
          line.push(raw.points);
          form.set(key, line);
        }
      }
    }

    // ── Byes + weather (both best effort) ──
    const byes = season ? await getNflByeWeeks(season) : {};
    const wxAbbrs = [...new Set([A.team, B.team].filter(Boolean).map((t) => t.toUpperCase()))];
    const snaps = await getWeatherForTeams(wxAbbrs).catch(() => [] as WeatherSnapshot[]);
    const wxByTeam = new Map(snaps.map((s) => [s.abbr.toUpperCase(), s]));

    // Same question, same league, same week → same answer. Sorted so A-vs-B
    // and B-vs-A share one verdict.
    const hash = crypto
      .createHash("sha1")
      .update(
        [platform, leagueKey, String(currentWeek), ...[playerNameKey(A.name), playerNameKey(B.name)].sort()].join(",")
      )
      .digest("hex")
      .slice(0, 16);

    let generated = false;
    const verdict = await withCache<Verdict>(`ai:startsit:v1:${hash}`, 3600, async () => {
      generated = true;
      return generateVerdict({
        platform,
        leagueName: league?.leagueName ?? null,
        teamCount: league?.teams?.length ?? 0,
        currentWeek,
        season,
        slotLine,
        descA: describePlayer("PLAYER A", A, form.get(playerNameKey(A.name)) ?? [], byes, currentWeek, wxByTeam.get(A.team.toUpperCase()) ?? null),
        descB: describePlayer("PLAYER B", B, form.get(playerNameKey(B.name)) ?? [], byes, currentWeek, wxByTeam.get(B.team.toUpperCase()) ?? null),
        nameA: A.name,
        nameB: B.name,
      });
    });

    // Log each fresh verdict for post-week scoring (the Coach's record).
    if (generated && season && currentWeek > 0) {
      void recordStartSitVerdict({
        hash,
        userId,
        platform: platform as any,
        leagueKey,
        teamKey,
        season,
        week: currentWeek,
        pick: verdict.pick,
        other: verdict.pick === A.name ? B.name : A.name,
        lean: verdict.lean,
        ts: Date.now(),
      });
    }

    return NextResponse.json({ ok: true, ...verdict, players: [A.name, B.name], week: currentWeek });
  } catch (e: any) {
    if (e instanceof AiBudgetExhaustedError) {
      return NextResponse.json(
        { ok: false, error: "budget_exhausted", message: "AI is taking a breather. Try again tomorrow." },
        { status: 429 }
      );
    }
    console.error("[analyze-startsit] failed:", e?.message || e);
    return NextResponse.json({ ok: false, error: "analysis_failed" }, { status: 502 });
  }
}
