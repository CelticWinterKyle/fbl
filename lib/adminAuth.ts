import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export function isAdmin(userId: string | null | undefined): boolean {
  const adminId = process.env.ADMIN_USER_ID;
  if (!adminId || !userId) return false;
  return userId === adminId;
}

export async function requireAdmin(): Promise<
  { userId: string } | NextResponse
> {
  const { userId } = await auth();
  if (!userId || !isAdmin(userId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return { userId };
}
