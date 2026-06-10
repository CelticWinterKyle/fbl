// ─── POST /api/odds/props ─────────────────────────────────────────────────────
// Player prop lines for the players on the caller's rosters, served as
// informational content inside the Odds tab (no link-outs; Phase B stays
// gated — see docs/ODDS_MONETIZATION_PLAN.md). The client sends the player
// names it already knows from /api/rosters/batch; we filter one global cached
// props payload down to those names, so quota cost never scales with users.
// Dormant (empty props) until ODDS_API_KEY is configured.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getCachedNflPlayerProps, playerNameKey } from "@/lib/odds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Generous ceiling: ~15 leagues x ~18 roster spots.
const MAX_NAMES = 400;

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const names: unknown = (body as { names?: unknown })?.names;
  if (
    !Array.isArray(names) ||
    names.length === 0 ||
    names.length > MAX_NAMES ||
    !names.every((n) => typeof n === "string" && n.length > 0 && n.length < 80)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_input" }, { status: 400 });
  }

  try {
    const data = await getCachedNflPlayerProps();
    const wanted = new Set(names.map(playerNameKey));
    const props = data.props.filter((p) => wanted.has(p.nameKey));
    const res = NextResponse.json({
      ok: true,
      props,
      source: data.source,
      updatedAt: data.updatedAt,
    });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e: any) {
    console.error("[odds/props] failed:", e?.message);
    return NextResponse.json(
      { ok: false, error: "Couldn't load player lines right now." },
      { status: 502 }
    );
  }
}
