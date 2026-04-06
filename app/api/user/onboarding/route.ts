// POST /api/user/onboarding — mark onboarding as complete for the current user

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { markOnboardingComplete } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  await markOnboardingComplete(userId);
  return NextResponse.json({ ok: true });
}
