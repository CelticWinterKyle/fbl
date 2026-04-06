import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  saveSleeperConnection,
  saveSleeperLeague,
  clearSleeperConnection,
  clearEspnConnection,
} from "@/lib/tokenStore/index";
import { lookupSleeperUser } from "@/lib/adapters/sleeper";

export const dynamic = "force-dynamic";

/** POST /api/sleeper/connect — validate username + save connection */
export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const username: string | undefined = body.username?.trim();

  if (!username) {
    return NextResponse.json({ ok: false, error: "username_required" }, { status: 400 });
  }

  try {
    const sleeperUser = await lookupSleeperUser(username);

    if (!sleeperUser?.user_id) {
      return NextResponse.json(
        { ok: false, error: "user_not_found", message: `No Sleeper user found for "${username}"` },
        { status: 404 }
      );
    }

    await saveSleeperConnection(userId, {
      username: sleeperUser.username,
      sleeperId: sleeperUser.user_id,
    });

    // If a league ID was also provided (from the league picker), save it too
    if (body.leagueId) {
      await saveSleeperLeague(userId, String(body.leagueId));
    }

    const res = NextResponse.json({
      ok: true,
      username: sleeperUser.username,
      displayName: sleeperUser.display_name,
      sleeperId: sleeperUser.user_id,
      avatar: sleeperUser.avatar ?? null,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "lookup_failed", message: e?.message || String(e) },
      { status: 502 }
    );
  }
}

/** DELETE /api/sleeper/connect — disconnect Sleeper */
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await clearSleeperConnection(userId);
  return NextResponse.json({ ok: true });
}
