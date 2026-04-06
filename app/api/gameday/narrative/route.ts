// POST /api/gameday/narrative
// Body: { matchups: [{ platform, leagueName, week, myTeamName, myScore, oppName, oppScore }] }
// Returns: { ok, narrative: string }

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { chatCompletion } from "@/lib/openai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Rate limiting: 5 narratives per user per hour ────────────────────────────

const RATE_LIMIT = 5;
const RATE_WINDOW_S = 3600;

async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!process.env.KV_REST_API_URL) return { allowed: true, remaining: RATE_LIMIT };
  try {
    const { kv } = await import("@vercel/kv");
    const key = `rl:gameday:${userId.slice(0, 16)}`;
    const count = (await kv.incr(key)) as number;
    if (count === 1) await kv.expire(key, RATE_WINDOW_S);
    return { allowed: count <= RATE_LIMIT, remaining: Math.max(0, RATE_LIMIT - count) };
  } catch {
    return { allowed: true, remaining: RATE_LIMIT };
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

type MatchupInput = {
  platform: string;
  leagueName: string;
  week: number;
  myTeamName: string;
  myScore: number;
  oppName: string;
  oppScore: number;
};

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const matchups: MatchupInput[] = Array.isArray(body?.matchups) ? body.matchups : [];

  if (matchups.length === 0) {
    return NextResponse.json({ ok: false, error: "no_matchups" }, { status: 400 });
  }

  const { allowed, remaining } = await checkRateLimit(userId);
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "rate_limited", message: "Narrative limit reached (5/hr). Try again later." },
      { status: 429 }
    );
  }

  // ── Build prompt ──
  const matchupLines = matchups.map((m, i) => {
    const diff = Math.abs(m.myScore - m.oppScore).toFixed(1);
    const status =
      m.myScore > m.oppScore ? `WINNING by ${diff}`
      : m.myScore < m.oppScore ? `LOSING by ${diff}`
      : "TIED";
    const platform = m.platform.charAt(0).toUpperCase() + m.platform.slice(1);
    return `${i + 1}. ${platform} — "${m.leagueName}" (Week ${m.week})\n   My team "${m.myTeamName}": ${m.myScore.toFixed(1)} pts\n   Opponent "${m.oppName}": ${m.oppScore.toFixed(1)} pts\n   → ${status}`;
  }).join("\n\n");

  const winCount = matchups.filter(m => m.myScore > m.oppScore).length;
  const lossCount = matchups.filter(m => m.myScore < m.oppScore).length;

  const prompt = [
    "You are a fantasy football Game Day analyst. Give a short, punchy live update on how a user is doing across their leagues.",
    "",
    `Current matchups (${matchups.length} league${matchups.length > 1 ? "s" : ""}, Week ${matchups[0].week}):`,
    "",
    matchupLines,
    "",
    `Overall: ${winCount} winning, ${lossCount} losing${matchups.length > winCount + lossCount ? ", 1 tied" : ""}.`,
    "",
    "Write 2-3 sentences of enthusiastic, conversational commentary. Be specific — use team names and scores. No bullet points. No intro like 'Here's your update:'. Just the commentary itself.",
  ].join("\n");

  try {
    const completion = await chatCompletion({
      messages: [{ role: "user", content: prompt }],
      model: "gpt-3.5-turbo",
      max_tokens: 160,
      temperature: 0.8,
      logTag: "gameday-narrative",
    });

    const narrative = completion.choices?.[0]?.message?.content?.trim() ?? "";

    const res = NextResponse.json({ ok: true, narrative, remaining });
    return res;
  } catch (e: any) {
    console.error("[gameday/narrative]", e?.message);
    return NextResponse.json({ ok: false, error: "ai_failed" }, { status: 500 });
  }
}
