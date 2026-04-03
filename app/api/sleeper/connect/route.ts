import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
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
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
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
    provisional.cookies.getAll().forEach((c) => res.cookies.set(c));
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
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);

  if (!userId) {
    return NextResponse.json({ ok: false, error: "no_user_id" }, { status: 400 });
  }

  await clearSleeperConnection(userId);
  return NextResponse.json({ ok: true });
}
