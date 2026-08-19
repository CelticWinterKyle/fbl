// ─── POST /api/partners/click ─────────────────────────────────────────────────
// Click counter for Game Day Partner links, fed by a sendBeacon from the card
// (the href itself goes straight to the merchant: no redirect hop, which
// Amazon's affiliate terms dislike and which would add latency to the click).
// Counts are per partner per UTC day: aff:clicks:{id}:{YYYY-MM-DD}, 90-day
// TTL. No user id: we need "does anyone click", not "who clicked".

import { NextRequest, NextResponse } from "next/server";
import { PARTNERS } from "@/lib/partners";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").slice(0, 64);
    // Only configured partners get counted; anything else is noise or probing.
    if (!id || !PARTNERS.some((p) => p.id === id)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    if (process.env.KV_REST_API_URL) {
      const { kv } = await import("@/lib/kv");
      const day = new Date().toISOString().slice(0, 10);
      const key = `aff:clicks:${id}:${day}`;
      const n = await kv.incr(key);
      if (n === 1) await kv.expire(key, 90 * 24 * 3600);
    }
    return NextResponse.json({ ok: true });
  } catch {
    // Never let metrics failures surface to the client.
    return NextResponse.json({ ok: true });
  }
}
