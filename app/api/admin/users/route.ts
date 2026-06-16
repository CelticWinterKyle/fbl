import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  readUserTokens,
  readSleeperConnection,
  readEspnConnections,
  getUserTheme,
  isOnboardingComplete,
  hasOddsAck,
  readSleeperLeagues,
  readUserLeagues,
} from "@/lib/tokenStore/index";
import { readPushSubs, readPushPrefs } from "@/lib/push";
import { readEspnHealth } from "@/lib/leagueRegistry";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const params = req.nextUrl.searchParams;
  const detailId = params.get("id");

  try {
    const clerk = await clerkClient();

    // Single user detail mode
    if (detailId) {
      const user = await clerk.users.getUser(detailId);
      const [
        yahooTokens, yahooLeagues, sleeperConn, sleeperLeagues,
        espnConns, pushSubs, pushPrefs, theme, onboarded, oddsAck,
      ] = await Promise.all([
        readUserTokens(detailId),
        readUserLeagues(detailId),
        readSleeperConnection(detailId),
        readSleeperLeagues(detailId),
        readEspnConnections(detailId),
        readPushSubs(detailId),
        readPushPrefs(detailId),
        getUserTheme(detailId),
        isOnboardingComplete(detailId),
        hasOddsAck(detailId),
      ]);

      const espnDetails = await Promise.all(
        espnConns.map(async (c) => {
          const health = await readEspnHealth(detailId, c.leagueId).catch(() => null);
          return {
            leagueId: c.leagueId,
            leagueName: c.leagueName ?? null,
            season: c.season,
            health,
          };
        })
      );

      return NextResponse.json({
        ok: true,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.emailAddresses[0]?.emailAddress ?? null,
          imageUrl: user.imageUrl,
          createdAt: user.createdAt,
          lastActiveAt: user.lastActiveAt,
        },
        connections: {
          yahoo: { connected: !!yahooTokens?.access_token, leagueCount: yahooLeagues.length },
          sleeper: {
            connected: !!sleeperConn,
            username: sleeperConn?.username ?? null,
            leagueCount: sleeperLeagues.length,
          },
          espn: { connected: espnConns.length > 0, leagueCount: espnConns.length, leagues: espnDetails },
        },
        push: {
          subscriptionCount: pushSubs.length,
          devices: pushSubs.map((s) => ({ device: s.device, addedAt: s.addedAt })),
          prefs: pushPrefs,
        },
        theme,
        onboarded,
        oddsAcked: oddsAck,
      });
    }

    // Paginated user list
    const offset = Math.max(0, Number(params.get("offset")) || 0);
    const limit = Math.min(50, Math.max(1, Number(params.get("limit")) || 20));
    const query = params.get("query")?.trim() || undefined;

    const res = await clerk.users.getUserList({
      offset,
      limit,
      orderBy: "-created_at",
      ...(query ? { query } : {}),
    });

    // Batch check which platforms each user has connected
    const users = await Promise.all(
      res.data.map(async (u) => {
        const [yahoo, sleeper, espn] = await Promise.all([
          readUserTokens(u.id).then((t) => !!t?.access_token).catch(() => false),
          readSleeperConnection(u.id).then((c) => !!c).catch(() => false),
          readEspnConnections(u.id).then((c) => c.length > 0).catch(() => false),
        ]);
        const platforms: string[] = [];
        if (yahoo) platforms.push("yahoo");
        if (sleeper) platforms.push("sleeper");
        if (espn) platforms.push("espn");

        return {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.emailAddresses[0]?.emailAddress ?? null,
          imageUrl: u.imageUrl,
          createdAt: u.createdAt,
          lastActiveAt: u.lastActiveAt,
          platforms,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      users,
      totalCount: res.totalCount,
      offset,
      limit,
    });
  } catch (e: any) {
    console.error("[admin/users]", e?.message || e);
    return NextResponse.json({ ok: false, error: "users_failed" }, { status: 500 });
  }
}
