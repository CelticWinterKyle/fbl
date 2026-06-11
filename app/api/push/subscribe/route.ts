// ─── /api/push/subscribe ──────────────────────────────────────────────────────
// POST   { subscription: { endpoint, keys: { p256dh, auth } }, device? }
// DELETE { endpoint }
// Stores one subscription per device under the Clerk user. The browser's
// PushSubscription.toJSON() is the wire format.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { addPushSub, removePushSub, readPushSubs, isPushConfigured } from "@/lib/push";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isValidSubscription(s: unknown): s is { endpoint: string; keys: { p256dh: string; auth: string } } {
  const sub = s as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  return (
    !!sub &&
    typeof sub.endpoint === "string" &&
    sub.endpoint.startsWith("https://") &&
    sub.endpoint.length < 1024 &&
    typeof sub.keys?.p256dh === "string" &&
    typeof sub.keys?.auth === "string"
  );
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const subs = await readPushSubs(userId);
  return NextResponse.json({
    ok: true,
    configured: isPushConfigured(),
    devices: subs.map((s) => ({ endpoint: s.endpoint, device: s.device ?? null, addedAt: s.addedAt })),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const subscription = (body as { subscription?: unknown })?.subscription;
  if (!isValidSubscription(subscription)) {
    return NextResponse.json({ ok: false, error: "invalid_subscription" }, { status: 400 });
  }
  const device = typeof (body as { device?: unknown })?.device === "string"
    ? ((body as { device: string }).device).slice(0, 64)
    : undefined;

  await addPushSub(userId, subscription, device);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const endpoint = (body as { endpoint?: unknown })?.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return NextResponse.json({ ok: false, error: "invalid_endpoint" }, { status: 400 });
  }
  await removePushSub(userId, endpoint);
  return NextResponse.json({ ok: true });
}
