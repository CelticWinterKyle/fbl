// ─── POST /api/admin/delete-user ──────────────────────────────────────────────
// Admin-only account removal, added ahead of the public launch so a hostile
// or spam account can be cut without leaving the app for the Clerk dashboard.
//
// Deliberately thin: it deletes the user in Clerk and nothing else. Clerk
// then fires the user.deleted webhook, and /api/webhooks/clerk wipes every KV
// key we hold for them (tokens, connections, my-team picks, theme). One
// cleanup path for dashboard deletions, self-deletions, and this button, so
// they can never drift apart.

import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/adminAuth";
import { isAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json().catch(() => ({}));
  const targetId = String(body.userId ?? "").trim();
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  }
  // The one deletion this button must never perform. Locking yourself out of
  // your own admin panel is not a recoverable oops.
  if (isAdmin(targetId)) {
    return NextResponse.json(
      { ok: false, error: "cannot_delete_admin", message: "You cannot delete your own admin account from here." },
      { status: 400 }
    );
  }

  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(targetId);
    console.log(`[admin/delete-user] deleted ${targetId.slice(0, 12)}... (KV cleanup via webhook)`);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[admin/delete-user]", e?.message || e);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}
