import { NextRequest, NextResponse } from "next/server";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { auth } from "@clerk/nextjs/server";
import { readEspnConnection } from "@/lib/tokenStore/index";
import { chatCompletion } from "@/lib/openai";
import { getWeatherForTeams, summarizeWeatherBrief } from "@/lib/weather";
import { generateWeatherOpportunities } from "@/lib/weatherOps";
import {
  fetchRoster,
  extractStarterQB,
  extractInjurySummary,
  extractStarterTeamAbbrs,
  teamKeyOf,
  teamNameOf,
} from "@/lib/adapters/yahoo";
import { fetchSleeperRoster } from "@/lib/adapters/sleeper";
import { fetchEspnRoster } from "@/lib/adapters/espn";
import type { NormalizedRoster, NormalizedPlayer } from "@/lib/types/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Rate limiting ────────────────────────────────────────────────────────────
// 15 AI analyses per user per hour. Uses KV in production; skipped in dev.

const RATE_LIMIT = 15;
const RATE_WINDOW_S = 3600; // 1 hour

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!process.env.KV_REST_API_URL) return { allowed: true, remaining: RATE_LIMIT };
  try {
    const { kv } = await import("@vercel/kv");
    const key = `rl:analyze:${userId.slice(0, 16)}`;
    const count = (await kv.incr(key)) as number;
    if (count === 1) await kv.expire(key, RATE_WINDOW_S);
    return { allowed: count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - count) };
  } catch {
    return { allowed: true, remaining: RATE_LIMIT }; // KV error → allow through
  }
}

// ─── Numeric helpers ──────────────────────────────────────────────────────────

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}
function logistic(delta: number, scale = 12): number {
  return Math.round((1 / (1 + Math.exp(-delta / scale))) * 100);
}
function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ─── Roster analysis helpers ──────────────────────────────────────────────────

function sumPoints(players: NormalizedPlayer[]): number {
  return Number(players.reduce((s, p) => s + (p.points ?? 0), 0).toFixed(2));
}
function sumProjected(players: NormalizedPlayer[]): number {
  return Number(players.reduce((s, p) => s + (p.projectedPoints ?? 0), 0).toFixed(2));
}

/** Top N starters by projectedPoints (or actual if no projections) */
function topStarters(
  roster: NormalizedRoster,
  n = 4
): NormalizedPlayer[] {
  return [...roster.starters]
    .sort((a, b) => {
      const byProj = (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0);
      if (byProj !== 0) return byProj;
      return (b.points ?? 0) - (a.points ?? 0);
    })
    .slice(0, n);
}

/** Detect QB+pass-catcher stacks from same NFL team */
function detectStacks(roster: NormalizedRoster): string {
  const qbs = roster.starters.filter((p) => p.primaryPosition === "QB" || p.position === "QB");
  const stacks: string[] = [];
  for (const qb of qbs) {
    const stackers = roster.starters.filter(
      (p) =>
        p.nflTeam === qb.nflTeam &&
        p.platformKey !== qb.platformKey &&
        ["WR", "TE", "RB"].includes(p.primaryPosition)
    );
    if (stackers.length > 0) {
      const names = [qb.name, ...stackers.map((p) => p.name)].join("+");
      stacks.push(`${names} (${qb.nflTeam})`);
    }
  }
  return stacks.join(", ");
}

/** Format a starter summary line for the AI prompt */
function formatStarterLine(p: NormalizedPlayer): string {
  const proj = p.projectedPoints > 0 ? `${p.projectedPoints.toFixed(1)} proj` : null;
  const actual = p.points > 0 ? `${p.points.toFixed(1)} pts` : null;
  const stat = [proj, actual].filter(Boolean).join(" / ");
  const status = p.status && p.status !== "active" ? ` [${p.status.toUpperCase()}]` : "";
  return `  ${p.position.padEnd(5)} ${p.name} (${p.nflTeam})${stat ? ` – ${stat}` : ""}${status}`;
}

/** Named injuries from starters */
function namedInjuries(roster: NormalizedRoster): string {
  const injured = roster.all.filter(
    (p) => p.status && p.status !== "active"
  );
  if (!injured.length) return "None";
  return injured
    .map((p) => `${p.name} (${p.status?.toUpperCase()})`)
    .join(", ");
}

// ─── Yahoo scoreboard helper ──────────────────────────────────────────────────

async function getScoreboard(yf: any, leagueKey: string, week?: number) {
  try {
    return await yf.league.scoreboard(leagueKey, week ? { week } : undefined);
  } catch {
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
    }

    const { allowed, remaining } = await checkRateLimit(userId);
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "rate_limited", message: "Too many analyses. Try again in an hour." },
        {
          status: 429,
          headers: { "Retry-After": String(RATE_WINDOW_S), "X-RateLimit-Remaining": "0" },
        }
      );
    }

    const body = await req.json();

    // Accept both old `league_key` (Yahoo backward compat) and new `leagueKey`
    const {
      aKey,
      bKey,
      week,
      platform = "yahoo",
      leagueKey: leagueKeyBody,
      league_key,
      aName: bodyNameA,
      bName: bodyNameB,
      season: bodySeason,
    } = body;

    const leagueKey: string | undefined = leagueKeyBody ?? league_key;

    if (!aKey || !bKey)
      return NextResponse.json({ ok: false, error: "missing_team_keys" }, { status: 400 });
    if (!leagueKey)
      return NextResponse.json({ ok: false, error: "missing_league_key" }, { status: 400 });

    // ── Platform-specific data fetch ──────────────────────────────────────────

    let rA: NormalizedRoster | null = null;
    let rB: NormalizedRoster | null = null;
    let projA = 0, projB = 0, actualA = 0, actualB = 0;
    let nameA = bodyNameA ?? "Team A";
    let nameB = bodyNameB ?? "Team B";
    let wk = Number(week ?? 1);
    let recentFormA: string | null = null;
    let recentFormB: string | null = null;

    // ── YAHOO ─────────────────────────────────────────────────────────────────
    if (platform === "yahoo") {
      const { yf, access, reason } = await getYahooAuthedForUser(userId);
      if (!access || !yf) {
        return NextResponse.json({ ok: false, error: reason || "not_authed" }, { status: 200 });
      }

      const sb = await getScoreboard(yf, leagueKey, week);
      const matchups: any[] = sb?.matchups ?? sb?.scoreboard?.matchups ?? [];
      const m = matchups.find((m: any) => {
        const t1 = m.teams?.[0] ?? m.team1 ?? m?.[0];
        const t2 = m.teams?.[1] ?? m.team2 ?? m?.[1];
        const k1 = teamKeyOf(t1);
        const k2 = teamKeyOf(t2);
        return (k1 === aKey && k2 === bKey) || (k1 === bKey && k2 === aKey);
      });

      if (!m) {
        return NextResponse.json({ ok: false, error: "matchup_not_found_for_week" });
      }

      const tA = m.teams?.[0] ?? m.team1 ?? m?.[0];
      const tB = m.teams?.[1] ?? m.team2 ?? m?.[1];
      nameA = teamNameOf(tA);
      nameB = teamNameOf(tB);

      const tAproj = n(tA?.team_projected_points?.total ?? tA?.projected_points?.total);
      const tBproj = n(tB?.team_projected_points?.total ?? tB?.projected_points?.total);
      const tAactual = n(tA?.team_points?.total ?? tA?.points?.total);
      const tBactual = n(tB?.team_points?.total ?? tB?.points?.total);

      const useProj = tAproj > 0 || tBproj > 0;
      projA = useProj ? tAproj : tAactual;
      projB = useProj ? tBproj : tBactual;
      actualA = tAactual;
      actualB = tBactual;

      wk = Number(week ?? sb?.week ?? sb?.scoreboard?.week ?? 1);

      [rA, rB] = await Promise.all([
        fetchRoster(access, aKey, leagueKey, wk).catch(() => null),
        fetchRoster(access, bKey, leagueKey, wk).catch(() => null),
      ]);

      // Recent form — Yahoo only (scoreboard available for past weeks)
      const lookback = [wk - 1, wk - 2, wk - 3].filter((x) => x >= 1);
      const recTotals: Record<string, number[]> = { [aKey]: [], [bKey]: [] };
      for (const w of lookback) {
        const s = await getScoreboard(yf, leagueKey, w);
        const ms: any[] = s?.matchups ?? s?.scoreboard?.matchups ?? [];
        for (const mm of ms) {
          const x1 = mm.teams?.[0] ?? mm.team1 ?? mm?.[0];
          const x2 = mm.teams?.[1] ?? mm.team2 ?? mm?.[1];
          const k1 = teamKeyOf(x1);
          const k2 = teamKeyOf(x2);
          const pts1 = n(x1?.team_points?.total ?? x1?.points?.total);
          const pts2 = n(x2?.team_points?.total ?? x2?.points?.total);
          if (k1 === aKey) recTotals[aKey].push(pts1);
          if (k2 === aKey) recTotals[aKey].push(pts2);
          if (k1 === bKey) recTotals[bKey].push(pts1);
          if (k2 === bKey) recTotals[bKey].push(pts2);
        }
      }
      recentFormA = `${recTotals[aKey].length}-game avg: ${avg(recTotals[aKey]).toFixed(1)}`;
      recentFormB = `${recTotals[bKey].length}-game avg: ${avg(recTotals[bKey]).toFixed(1)}`;
    }

    // ── SLEEPER ───────────────────────────────────────────────────────────────
    else if (platform === "sleeper") {
      wk = Number(week ?? 1);
      [rA, rB] = await Promise.all([
        fetchSleeperRoster(leagueKey, aKey, wk).catch(() => null),
        fetchSleeperRoster(leagueKey, bKey, wk).catch(() => null),
      ]);
      actualA = rA ? sumPoints(rA.starters) : 0;
      actualB = rB ? sumPoints(rB.starters) : 0;
      projA = actualA; projB = actualB; // Sleeper has no projections
    }

    // ── ESPN ──────────────────────────────────────────────────────────────────
    else if (platform === "espn") {
      const espnConn = await readEspnConnection(userId);
      const season = bodySeason ?? espnConn?.season ?? new Date().getFullYear() - 1;
      const creds =
        espnConn?.espnS2 || espnConn?.swid
          ? { espnS2: espnConn.espnS2, swid: espnConn.swid }
          : undefined;

      wk = Number(week ?? 1);
      [rA, rB] = await Promise.all([
        fetchEspnRoster(leagueKey, aKey, season, wk, creds).catch(() => null),
        fetchEspnRoster(leagueKey, bKey, season, wk, creds).catch(() => null),
      ]);
      projA = rA ? sumProjected(rA.starters) : 0;
      projB = rB ? sumProjected(rB.starters) : 0;
      actualA = rA ? sumPoints(rA.starters) : 0;
      actualB = rB ? sumPoints(rB.starters) : 0;
    }

    // ── Win probability ───────────────────────────────────────────────────────

    const useProj = (projA > 0 || projB > 0) && platform !== "sleeper";
    const aTotal = useProj ? projA : actualA;
    const bTotal = useProj ? projB : actualB;
    const gapPts = Number((aTotal - bTotal).toFixed(1));
    const pA = logistic(gapPts);
    const pB = 100 - pA;

    // ── QB showdown ───────────────────────────────────────────────────────────

    const qbA = rA ? extractStarterQB(rA) : null;
    const qbB = rB ? extractStarterQB(rB) : null;
    let showdownNote = "QB edge: ";
    if (qbA && qbB) {
      const delta = Number((qbA.proj - qbB.proj).toFixed(1));
      if (Math.abs(delta) < 0.5) showdownNote += "even";
      else showdownNote += delta > 0 ? `${nameA} by +${delta}` : `${nameB} by ${Math.abs(delta)}`;
    } else {
      showdownNote += gapPts >= 0 ? nameA : nameB;
    }

    // ── Injury pills ──────────────────────────────────────────────────────────

    const injA = rA ? extractInjurySummary(rA) : { questionable: 0, out: 0, ir: 0 };
    const injB = rB ? extractInjurySummary(rB) : { questionable: 0, out: 0, ir: 0 };
    const injuries: any[] = [];
    if (injA.questionable) injuries.push({ team: "A", q: injA.questionable });
    if (injA.out) injuries.push({ team: "A", o: injA.out });
    if (injA.ir) injuries.push({ team: "A", ir: injA.ir });
    if (injB.questionable) injuries.push({ team: "B", q: injB.questionable });
    if (injB.out) injuries.push({ team: "B", o: injB.out });
    if (injB.ir) injuries.push({ team: "B", ir: injB.ir });

    // ── Weather (outdoor starters only) ──────────────────────────────────────

    const abbrs = [
      ...(rA ? extractStarterTeamAbbrs(rA) : []),
      ...(rB ? extractStarterTeamAbbrs(rB) : []),
    ];
    const weatherSnaps = await getWeatherForTeams(abbrs);
    const weatherBrief = summarizeWeatherBrief(weatherSnaps, 200);

    const mapStarter = (p: NormalizedPlayer) => ({
      name: p.name,
      pos: p.primaryPosition || p.position,
      team: p.nflTeam,
    });
    const startersA = (rA?.starters ?? []).map(mapStarter);
    const startersB = (rB?.starters ?? []).map(mapStarter);
    const weatherOpportunities = generateWeatherOpportunities(
      startersA, startersB, weatherSnaps, nameA, nameB
    );

    // ── Build prompt context ──────────────────────────────────────────────────

    const topA = rA ? topStarters(rA, 5) : [];
    const topB = rB ? topStarters(rB, 5) : [];
    const stackA = rA ? detectStacks(rA) : "";
    const stackB = rB ? detectStacks(rB) : "";
    const injuredNamesA = rA ? namedInjuries(rA) : "N/A";
    const injuredNamesB = rB ? namedInjuries(rB) : "N/A";

    // Bench players for Team A (user's team) — used for bench swap suggestions
    const benchA = (rA?.bench ?? [])
      .sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0))
      .slice(0, 5);

    const platformLabel = platform === "yahoo" ? "Yahoo" : platform === "sleeper" ? "Sleeper" : "ESPN";
    const scoreLabel = useProj ? "Projected" : "Live";

    const benchLines = benchA.length
      ? ["", `━━ ${nameA} Bench ━━`, ...benchA.map(formatStarterLine)]
      : [];

    const promptLines = [
      `Fantasy Football Matchup — Week ${wk} (${platformLabel})`,
      `${scoreLabel} Scores: ${nameA} ${aTotal.toFixed(1)} vs ${nameB} ${bTotal.toFixed(1)}`,
      ``,
      `━━ ${nameA} ━━`,
      qbA ? `  QB: ${qbA.name} (${qbA.proj.toFixed(1)} proj)` : "",
      ...(topA.length ? topA.map(formatStarterLine) : []),
      stackA ? `  Stack: ${stackA}` : "",
      `  Injuries: ${injuredNamesA}`,
      recentFormA ? `  Recent form: ${recentFormA}` : "",
      ...benchLines,
      ``,
      `━━ ${nameB} ━━`,
      qbB ? `  QB: ${qbB.name} (${qbB.proj.toFixed(1)} proj)` : "",
      ...(topB.length ? topB.map(formatStarterLine) : []),
      stackB ? `  Stack: ${stackB}` : "",
      `  Injuries: ${injuredNamesB}`,
      recentFormB ? `  Recent form: ${recentFormB}` : "",
      weatherBrief ? `\nWeather: ${weatherBrief}` : "",
      ``,
      `Return ONLY valid JSON with this exact shape — no markdown, no explanation:`,
      `{`,
      `  "analysis": "3-4 sentence breakdown. Name specific players. Lead with the biggest edge. End with the swing factor.",`,
      `  "xFactor": "One player whose ceiling/floor decides this matchup. One sentence.",`,
      `  "boomBust": ["One boom upside note", "One bust/risk note"],`,
      `  "benchHelp": "Specific swap from ${nameA}'s bench if one exists — 'Start X over Y (X.X vs Y.Y proj)'. Null if no upgrade is obvious."`,
      `}`,
    ]
      .filter((line) => line !== "")
      .join("\n");

    // ── OpenAI call ───────────────────────────────────────────────────────────

    let aiAnalysis: string | null = null;
    let xFactor: string = "";
    let boomBust: string[] = [];
    let benchHelp: string | null = null;

    try {
      const aiRes = await chatCompletion({
        messages: [
          {
            role: "system",
            content:
              "You are a blunt, expert fantasy football analyst. Name players explicitly. Never hedge. Never use filler like 'this is a tough matchup' or 'both teams have weapons'. Give direct, actionable takes. Output only the JSON object requested — nothing else.",
          },
          { role: "user", content: promptLines },
        ],
        response_format: { type: "json_object" },
      });

      const raw = aiRes.choices?.[0]?.message?.content ?? null;
      if (raw) {
        const parsed = JSON.parse(raw);
        aiAnalysis = typeof parsed.analysis === "string" ? parsed.analysis.trim() : null;
        xFactor = typeof parsed.xFactor === "string" ? parsed.xFactor.trim() : "";
        boomBust = Array.isArray(parsed.boomBust)
          ? parsed.boomBust.filter((s: any) => typeof s === "string").slice(0, 2)
          : [];
        benchHelp = typeof parsed.benchHelp === "string" && parsed.benchHelp.toLowerCase() !== "null"
          ? parsed.benchHelp.trim()
          : null;
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      week: wk,
      insight: {
        winProbA: pA,
        winProbB: pB,
        gapPts,
        headline: `${scoreLabel}: ${nameA} vs ${nameB}`,
        showdown: {
          a: qbA ? `${qbA.name} (QB · ${qbA.proj.toFixed(1)} proj)` : "QB",
          b: qbB ? `${qbB.name} (QB · ${qbB.proj.toFixed(1)} proj)` : "QB",
          note: showdownNote,
        },
        boomBust,
        xFactor,
        recentForm: { a: recentFormA ?? "—", b: recentFormB ?? "—" },
        injuries,
        weather: weatherBrief,
        weatherOpportunities,
        benchHelp,
        aiAnalysis,
        topStartersA: topA.map((p) => ({ name: p.name, pos: p.position, proj: p.projectedPoints, actual: p.points, nflTeam: p.nflTeam, status: p.status })),
        topStartersB: topB.map((p) => ({ name: p.name, pos: p.position, proj: p.projectedPoints, actual: p.points, nflTeam: p.nflTeam, status: p.status })),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "server_error" },
      { status: 500 }
    );
  }
}
