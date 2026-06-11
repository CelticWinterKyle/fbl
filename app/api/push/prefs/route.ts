// ─── /api/push/prefs ──────────────────────────────────────────────────────────
// GET returns the user's notification preferences (defaults applied).
// POST { td?, closeGame?, final? } saves them.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { readPushPrefs, savePushPrefs } from "@/lib/push";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const prefs = await readPushPrefs(userId);
  return NextResponse.json({ ok: true, prefs });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
  const current = await readPushPrefs(userId);
  const b = body as Partial<Record<"td" | "closeGame" | "final" | "lineup", unknown>>;
  const next = {
    td: typeof b.td === "boolean" ? b.td : current.td,
    closeGame: typeof b.closeGame === "boolean" ? b.closeGame : current.closeGame,
    final: typeof b.final === "boolean" ? b.final : current.final,
    lineup: typeof b.lineup === "boolean" ? b.lineup : current.lineup,
  };
  await savePushPrefs(userId, next);
  return NextResponse.json({ ok: true, prefs: next });
}
