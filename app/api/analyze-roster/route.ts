// POST /api/analyze-roster
// Roster-focused AI analysis for My Team page.
// Accepts pre-loaded starters/bench — no platform re-fetch needed.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { chatCompletion } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Rate limiting (shared limit with analyze-matchup) ────────────────────────

const RATE_LIMIT = 15;
const RATE_WINDOW_S = 3600;

async function checkRateLimit(userId: string): Promise<boolean> {
  if (!process.env.KV_REST_API_URL) return true;
  try {
    const { kv } = await import("@vercel/kv");
    const key = `rl:analyze:${userId.slice(0, 16)}`;
    const count = (await kv.incr(key)) as number;
    if (count === 1) await kv.expire(key, RATE_WINDOW_S);
    return count <= RATE_LIMIT;
  } catch {
    return true;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Player = {
  name: string;
  position: string;
  team: string | null;
  points: number;
  actual: number;
  projection: number;
  projectedPoints: number;
  status: string | null;
};

// ─── Prompt helpers ───────────────────────────────────────────────────────────

function playerLine(p: Player): string {
  const proj = (p.projectedPoints ?? p.projection ?? 0);
  const actual = (p.points ?? p.actual ?? 0);
  const pts = proj > 0 ? `${proj.toFixed(1)} proj` : actual > 0 ? `${actual.toFixed(1)} pts` : "0.0";
  const status = p.status && p.status !== "active" ? ` [${p.status.toUpperCase()}]` : "";
  return `  ${p.position.padEnd(5)} ${p.name}${p.team ? ` (${p.team})` : ""} — ${pts}${status}`;
}

function detectStack(starters: Player[]): string | null {
  const qbs = starters.filter(p => p.position === "QB" && p.team);
  for (const qb of qbs) {
    const stackers = starters.filter(
      p => p.team === qb.team && p.name !== qb.name && ["WR", "TE", "RB"].includes(p.position)
    );
    if (stackers.length > 0) {
      return `${qb.name} + ${stackers.map(p => p.name).join("/")} (${qb.team} stack)`;
    }
  }
  return null;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const allowed = await checkRateLimit(userId);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(RATE_WINDOW_S) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { teamName, week, starters, bench } = body as {
    teamName?: string;
    week?: number;
    starters?: Player[];
    bench?: Player[];
  };

  if (!starters?.length) {
    return NextResponse.json({ ok: false, error: "no_roster_data" }, { status: 400 });
  }

  const name = teamName ?? "Your Team";
  const wk = Number(week ?? 1);
  const benchPlayers: Player[] = bench ?? [];

  const stackNote = detectStack(starters);

  const promptLines = [
    `Fantasy Football Roster Analysis — Week ${wk}`,
    `Team: ${name}`,
    ``,
    `━━ Starters ━━`,
    ...starters.map(playerLine),
    stackNote ? `\nStack detected: ${stackNote}` : "",
    benchPlayers.length ? `\n━━ Bench ━━` : "",
    ...benchPlayers.map(playerLine),
    ``,
    `Return ONLY valid JSON — no markdown:`,
    `{`,
    `  "weeklyOutlook": "1-2 sentences on this roster's ceiling and floor this week. Be specific.",`,
    `  "startSit": ["Specific swap if a bench player clearly beats a starter — 'Start X over Y (X.X vs Y.Y proj)'. Only include if the edge is real. Empty array if no obvious upgrade."],`,
    `  "injuryAlerts": ["Named player + specific concern for any Q/Out/IR starters. Empty array if none."],`,
    `  "keyTakeaway": "The single most important thing to act on right now. One sentence.",`,
    `  "stackNote": ${stackNote ? `"Comment on the ${stackNote} stack — upside and risk."` : "null"}`,
    `}`,
  ]
    .filter(l => l !== "")
    .join("\n");

  let insight: Record<string, unknown> = {};

  try {
    const aiRes = await chatCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are a direct fantasy football roster advisor. Name players explicitly. Only recommend start/sit swaps where the projection gap is meaningful (2+ points). Skip filler. Output only the JSON requested.",
        },
        { role: "user", content: promptLines },
      ],
      response_format: { type: "json_object" },
    });

    const raw = aiRes.choices?.[0]?.message?.content ?? null;
    if (raw) {
      const parsed = JSON.parse(raw);
      insight = {
        weeklyOutlook: typeof parsed.weeklyOutlook === "string" ? parsed.weeklyOutlook.trim() : null,
        startSit: Array.isArray(parsed.startSit)
          ? parsed.startSit.filter((s: any) => typeof s === "string").slice(0, 3)
          : [],
        injuryAlerts: Array.isArray(parsed.injuryAlerts)
          ? parsed.injuryAlerts.filter((s: any) => typeof s === "string").slice(0, 4)
          : [],
        keyTakeaway: typeof parsed.keyTakeaway === "string" ? parsed.keyTakeaway.trim() : null,
        stackNote: typeof parsed.stackNote === "string" ? parsed.stackNote.trim() : null,
      };
    }
  } catch {}

  return NextResponse.json({ ok: true, insight });
}
