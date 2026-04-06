// GET /api/user/id
// Returns the authenticated user's Clerk userId.
// Used by the browser extension (fbl-sync.js) to get the userId
// so it can include it in relay requests via x-fbl-uid header.

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, userId });
}
