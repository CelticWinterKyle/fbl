// POST /api/analyze-roster
// Roster-focused AI analysis for My Team page.
// Accepts pre-loaded starters/bench — no platform re-fetch needed.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { createHash } from "crypto";
import { chatCompletion } from "@/lib/openai";
import { withCache } from "@/lib/cache";
import { checkAndSpendAiBudget, AiBudgetExhaustedError } from "@/lib/aiBudget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Rate limiting (shared limit with analyze-matchup) ────────────────────────

const RATE_LIMIT = 15;
const RATE_WINDOW_S = 3600;

async function checkRateLimit(userId: string): Promise<boolean> {
  // In production, no KV (or a KV failure) means fail closed; in dev, allow through.
  const failClosed = !!process.env.VERCEL && process.env.NODE_ENV === "production";
  if (!process.env.KV_REST_API_URL) return !failClosed;
  try {
    const { kv } = await import("@/lib/kv");
    const key = `rl:analyze:${userId}`;
    const count = (await kv.incr(key)) as number;
    if (count === 1) await kv.expire(key, RATE_WINDOW_S);
    return count <= RATE_LIMIT;
  } catch {
    return !failClosed;
  }
}

// ─── Input validation ─────────────────────────────────────────────────────────
// Player strings flow into the OpenAI prompt, so cap lengths and array sizes.

const playerSchema = z.object({
  name: z.string().max(80),
  position: z.string().max(80),
  team: z.string().max(80).nullish(),
  points: z.number().optional(),
  actual: z.number().optional(),
  projection: z.number().optional(),
  projectedPoints: z.number().optional(),
  status: z.string().max(80).nullish(),
});

const bodySchema = z.object({
  teamName: z.string().max(80).optional(),
  week: z.number().optional(),
  starters: z.array(playerSchema).max(30).optional(),
  bench: z.array(playerSchema).max(30).optional(),
});

type Player = z.infer<typeof playerSchema>;

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
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }
  const { teamName, week, starters, bench } = parsedBody.data;

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

  // ── Cached OpenAI call ──
  // Input is user-supplied roster JSON, so key on a short hash of the
  // canonicalized (zod-parsed) payload: identical rosters share one cache entry
  // for an hour. The fetcher throws on AI failure so junk is never cached;
  // budget is checked inside the fetcher so cache hits cost nothing.

  const rosterHash = createHash("sha256")
    .update(JSON.stringify({ teamName: name, week: wk, starters, bench: benchPlayers }))
    .digest("hex")
    .slice(0, 16);
  const aiCacheKey = `ai:roster:${rosterHash}`;

  let insight: Record<string, unknown> = {};
  let degraded = false;

  try {
    insight = await withCache(aiCacheKey, 3600, async (): Promise<Record<string, unknown>> => {
      const budget = await checkAndSpendAiBudget(2000);
      if (!budget.allowed) throw new AiBudgetExhaustedError();

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
      if (!raw) throw new Error("empty_ai_response");
      const parsed = JSON.parse(raw);
      return {
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
    });
  } catch (e) {
    if (e instanceof AiBudgetExhaustedError) {
      return NextResponse.json({ ok: false, error: "ai_budget_exhausted" }, { status: 429 });
    }
    console.error("[analyze-roster] AI analysis failed:", e);
    degraded = true;
  }

  return NextResponse.json({ ok: true, insight, ...(degraded ? { degraded: true } : {}) });
}
