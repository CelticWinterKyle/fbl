// ─── POST /api/analyze-trade ──────────────────────────────────────────────────
// AI verdict on a proposed trade (SEASON_FEATURES_PLAN.md #6), grounded in
// real league data rather than the model's vibes:
//   - BOTH full rosters (positional depth = what each side actually needs)
//   - injury status for every player
//   - recent form: each traded player's actual points over the last 4
//     completed weeks (per-week roster fetches, same infra as week browsing)
//   - league shape (team count, week, season)
// Rate limited and budgeted like the other AI routes; identical proposals
// share a 1h cache.

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLATFORMS = new Set(["yahoo", "sleeper", "espn"]);
const FORM_WEEKS = 4;

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

function pickPlayers(pool: RosterPlayer[], names: string[]): RosterPlayer[] | null {
  const byKey = new Map(pool.map((p) => [playerNameKey(p.name), p]));
  const picked: RosterPlayer[] = [];
  for (const name of names) {
    const p = byKey.get(playerNameKey(name));
    if (!p) return null;
    picked.push(p);
  }
  return picked;
}

function statusFlag(p: RosterPlayer): string {
  return p.status && p.status !== "active" ? ` [${p.status.toUpperCase()}]` : "";
}

/** "QB: P. Mahomes | RB: B. Robinson, J. Cook [Q] | ..." grouped depth chart. */
function rosterSummary(players: RosterPlayer[]): string {
  const groups = new Map<string, string[]>();
  for (const p of players) {
    const pos = p.position === "BN" || p.position === "IR" ? "BENCH" : p.position;
    const list = groups.get(pos) ?? [];
    list.push(`${p.name}${statusFlag(p)}`);
    groups.set(pos, list);
  }
  return [...groups.entries()].map(([pos, names]) => `${pos}: ${names.join(", ")}`).join(" | ");
}

function describeTraded(
  players: RosterPlayer[],
  form: Map<string, number[]>,
  byes: Record<string, number>,
  currentWeek: number
): string {
  return players
    .map((p) => {
      const line = form.get(playerNameKey(p.name));
      const formStr =
        line && line.length > 0
          ? `recent weeks: ${line.map((x) => x.toFixed(1)).join(", ")} pts`
          : `latest week: ${p.points.toFixed(1)} pts`;
      const bye = byes[(p.team || "").toUpperCase()];
      const byeStr =
        typeof bye === "number" && currentWeek > 0
          ? bye >= currentWeek
            ? `; bye week ${bye} STILL AHEAD`
            : `; bye already passed (wk ${bye})`
          : "";
      return `${p.name} (${p.position}, ${p.team || "FA"}${statusFlag(p)}; ${formStr}; proj ${p.projection.toFixed(1)}${byeStr})`;
    })
    .join("; ");
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
  const myTeamName = typeof b?.myTeamName === "string" ? b.myTeamName.slice(0, 80) : "";
  const theirTeamName = typeof b?.theirTeamName === "string" ? b.theirTeamName.slice(0, 80) : "";
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
    // ── Current rosters (both sides) + league snapshot ──
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

    const [mine, theirs, snapshot] = await Promise.all([
      getRosterForUser(userId, { platform: platform as any, teamKey: myTeamKey, leagueKey, requestedWeek: null }),
      getRosterForUser(userId, { platform: platform as any, teamKey: theirTeamKey, leagueKey, requestedWeek: null }),
      leagueSnapshotP,
    ]);
    if (!(mine as any)?.ok || !(theirs as any)?.ok) {
      return NextResponse.json({ ok: false, error: "rosters_unavailable" }, { status: 502 });
    }

    const myPool = allPlayers(mine);
    const theirPool = allPlayers(theirs);
    const giving = pickPlayers(myPool, give);
    const getting = pickPlayers(theirPool, get);
    if (!giving || !getting) {
      return NextResponse.json(
        { ok: false, error: "player_not_on_roster", message: "One of those players is not on the selected roster." },
        { status: 400 }
      );
    }

    const league = snapshot && !isError(snapshot) ? snapshot : null;
    const currentWeek = (league?.currentWeek ?? Number((mine as any)?.week)) || 0;
    const teamCount = league?.teams?.length ?? 0;

    // ── Stakes: records and standings rank for both sides ──
    // PlatformTeam carries names (not keys), so match on the display names
    // the client sends; best effort, omitted when names don't line up.
    function standingLine(label: string, teamName: string): string | null {
      if (!league || !teamName) return null;
      const sorted = [...league.teams].sort(
        (a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor)
      );
      const idx = sorted.findIndex((t) => t.name === teamName);
      if (idx === -1) return null;
      const t = sorted[idx];
      return `${label} ("${t.name}") record: ${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}, ranked ${idx + 1} of ${sorted.length}, ${t.pointsFor.toFixed(1)} points for.`;
    }
    const myStanding = standingLine("MY TEAM", myTeamName);
    const theirStanding = standingLine("THEIR TEAM", theirTeamName);

    // ── League rules: starting-slot requirements drive scarcity ──
    const slotLine =
      league?.rosterPositions && league.rosterPositions.length > 0
        ? `Starting slots: ${league.rosterPositions.map((r) => `${r.position}x${r.count}`).join(", ")}.`
        : null;

    // ── Bye weeks still ahead for the traded players ──
    const byes = league?.season ? await getNflByeWeeks(league.season) : {};

    // ── Recent form: traded players' points over the last completed weeks ──
    // Per-week roster fetches reuse the week-browsing cache; missing weeks
    // (player was elsewhere, bye, data gap) are simply skipped.
    const tradedKeys = new Set([...giving, ...getting].map((p) => playerNameKey(p.name)));
    const form = new Map<string, number[]>();
    if (currentWeek > 1) {
      const weeks: number[] = [];
      for (let w = currentWeek - 1; w >= Math.max(1, currentWeek - FORM_WEEKS) ; w--) weeks.push(w);
      const weekly = await Promise.all(
        weeks.flatMap((w) => [
          getRosterForUser(userId, { platform: platform as any, teamKey: myTeamKey, leagueKey, requestedWeek: String(w) }).catch(() => null),
          getRosterForUser(userId, { platform: platform as any, teamKey: theirTeamKey, leagueKey, requestedWeek: String(w) }).catch(() => null),
        ])
      );
      // weeks are ordered newest-first; record each traded player's line.
      for (const result of weekly) {
        if (!(result as any)?.ok) continue;
        for (const raw of allPlayers(result)) {
          const key = playerNameKey(raw.name);
          if (!tradedKeys.has(key)) continue;
          const line = form.get(key) ?? [];
          line.push(raw.points);
          form.set(key, line);
        }
      }
    }

    // Identical proposals (same league, same players) share a verdict.
    const hash = crypto
      .createHash("sha1")
      .update([platform, leagueKey, ...give.map(playerNameKey).sort(), "|", ...get.map(playerNameKey).sort()].join(","))
      .digest("hex")
      .slice(0, 16);

    const verdict = await withCache<TradeVerdict>(`ai:trade:v3:${hash}`, 3600, async () => {
      const budget = await checkAndSpendAiBudget(3000);
      if (!budget.allowed) throw new AiBudgetExhaustedError();

      const systemPrompt = [
        "You are a veteran fantasy football analyst who has graded thousands of real trades. You evaluate SITUATIONS, not players in a vacuum.",
        "Evaluate from MY TEAM's perspective. Apply professional trade principles:",
        "(1) The best player in the deal usually wins it; depth rarely beats top-end talent.",
        "(2) 2-for-1 or 3-for-2 trades favor the side consolidating talent IF their roster can absorb the lost depth; check the rosters shown.",
        "(3) Read the stakes: a team near the top should consolidate for a title run; a team near the bottom should maximize long-term value or swing for upside. Use the records and ranks provided.",
        "(4) Positional scarcity follows the league's STARTING SLOTS shown: more required starters at a position means depth there matters more.",
        "(5) Trading FROM surplus INTO a hole beats raw value parity; identify each side's holes from the depth charts.",
        "(6) Weigh recent form across the listed weeks and injury flags; an OUT/IR player's value is his return timeline, not his name.",
        "(7) Bye weeks STILL AHEAD reduce short-term value for a contender in the stretch run; ignore byes already passed.",
        "Use ONLY the rosters, stats, statuses, standings, and byes provided, plus your general knowledge of player quality and age. Never invent news, schedules, or stats you cannot see. If the week number indicates late season, weigh the fantasy-playoff stretch (typically weeks 15-17) heavily.",
        'Respond with ONLY a JSON object: {"verdict": "accept"|"reject"|"fair", "fairness": 1-10, "summary": string, "reasoning": string, "lineupImpact": string}.',
        "fairness: 10 means perfectly even, 1 means a total fleecing (of either side).",
        "summary: one punchy sentence a group chat would quote. reasoning: three to five sentences that cite the specific data (records, depth, form, byes) like a real analyst. lineupImpact: one or two sentences naming who enters/exits MY TEAM's starting lineup, using the roster shown.",
        "No markdown, no emojis, no em dashes.",
      ].join(" ");

      const userPrompt = [
        `League: ${platform}${teamCount ? `, ${teamCount} teams` : ""}${league?.leagueName ? `, "${league.leagueName}"` : ""}${currentWeek ? `, week ${currentWeek}` : ""}${league?.season ? `, ${league.season} season` : ""}.`,
        slotLine,
        myStanding,
        theirStanding,
        "",
        `MY TEAM roster: ${rosterSummary(myPool)}`,
        "",
        `THEIR roster: ${rosterSummary(theirPool)}`,
        "",
        `MY TEAM gives: ${describeTraded(giving, form, byes, currentWeek)}.`,
        `MY TEAM receives: ${describeTraded(getting, form, byes, currentWeek)}.`,
        "",
        "Recent-week point lines are newest first. Points are real scored fantasy points from this league.",
      ]
        .filter((l): l is string => l !== null)
        .join("\n");

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
