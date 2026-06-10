// ─── /api/odds ────────────────────────────────────────────────────────────────
// This week's NFL game lines, served as informational content (Phase A of
// docs/ODDS_MONETIZATION_PLAN.md). Lines are public information, so games are
// returned regardless of the 21+ acknowledgement; the gate is presentational
// and the client decides what to render. POST { ack: true } records the
// per-user self-attestation.
//
// Measurement (the point of Phase A) is fire-and-forget and never blocks:
//   - KV incr  odds:opens:{YYYY-MM-DD}   (14-day expiry)
//   - KV set   odds:lastopen:{userId}    (= Date.now())
//   - recordEvent("odds_tab_open", userId) when Postgres is provisioned

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCachedNflOdds } from "@/lib/odds";
import { hasOddsAck, setOddsAck } from "@/lib/tokenStore/index";
import { recordEvent } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const OPENS_TTL_S = 14 * 24 * 3600;

function recordOddsOpen(userId: string): void {
  void recordEvent("odds_tab_open", userId).catch(() => {});
  // KV counters are best-effort: no-op in dev (KV absent), swallow failures.
  if (!process.env.KV_REST_API_URL) return;
  void (async () => {
    try {
      const { kv } = await import("@vercel/kv");
      const opensKey = `odds:opens:${new Date().toISOString().slice(0, 10)}`;
      await kv.incr(opensKey);
      await kv.expire(opensKey, OPENS_TTL_S);
      await kv.set(`odds:lastopen:${userId}`, Date.now());
    } catch {
      // Measurement must never surface on the hot path.
    }
  })();
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  recordOddsOpen(userId);

  try {
    const [acked, data] = await Promise.all([hasOddsAck(userId), getCachedNflOdds()]);
    const res = NextResponse.json({
      ok: true,
      acked,
      games: data.games,
      source: data.source,
      updatedAt: data.updatedAt,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e: any) {
    console.error("[odds] failed:", e?.message);
    return NextResponse.json(
      { ok: false, error: "Couldn't load lines right now." },
      { status: 502 }
    );
  }
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // fall through to the 400 below
  }
  if (!body || typeof body !== "object" || (body as { ack?: unknown }).ack !== true) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  await setOddsAck(userId);
  return NextResponse.json({ ok: true, acked: true });
}
