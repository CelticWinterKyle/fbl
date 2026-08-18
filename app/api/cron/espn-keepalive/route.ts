// ─── /api/cron/espn-keepalive ─────────────────────────────────────────────────
// Vercel Cron (nightly): walk every user with an ESPN connection, exercise the
// Disney ONESITE refresh path, persist any newly-minted espn_s2, and record
// per-connection health. This is what makes "stays connected" true by
// construction instead of depending on the user's desktop Chrome being open.

import { NextRequest, NextResponse } from "next/server";
import { listEspnUsers, listRegisteredLeagues } from "@/lib/leagueRegistry";
import { runSeasonRollover } from "@/lib/seasonRollover";
import { verifyEspnForUser } from "@/lib/espnVerify";
import { recordCronHeartbeat } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_USERS_PER_RUN = 200;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const users = (await listEspnUsers()).slice(0, MAX_USERS_PER_RUN);
  let healthy = 0;
  let refreshedCreds = 0;
  let unhealthy = 0;
  let seasonsBumped = 0;

  for (const userId of users) {
    // Shared with the on-demand check on the Leagues page (lib/espnVerify.ts),
    // so the page and the cron can never disagree about what "connected"
    // means. That divergence is exactly what made a dead connection look fine.
    for (const v of await verifyEspnForUser(userId)) {
      if (v.ok) healthy++;
      else unhealthy++;
      if (v.credsRefreshed) refreshedCreds++;
      if (v.seasonBumped) seasonsBumped++;
    }
  }

  // 4. Yahoo/Sleeper season rollover sweep: those platforms mint NEW league
  //    ids each season (Yahoo per-season game codes, Sleeper fresh league_ids),
  //    so the nightly pass migrates any stored id whose league has renewed.
  //    This heals users who never open the dashboard (push subscribers) —
  //    active users also self-heal on load via /api/leagues/data. Probes are
  //    negative-cached ~20h in lib/seasonRollover.ts, so re-checking nightly
  //    is at most one platform call per league per day.
  let rollovers = 0;
  try {
    const regs = await listRegisteredLeagues();
    const rolloverUsers = [
      ...new Set(
        regs
          .filter((r) => r.platform === "yahoo" || r.platform === "sleeper")
          .map((r) => r.userId)
      ),
    ].slice(0, MAX_USERS_PER_RUN);
    for (const uid of rolloverUsers) {
      rollovers += (await runSeasonRollover(uid)).migrated;
    }
  } catch (e) {
    console.warn("[cron/espn-keepalive] rollover sweep failed:", (e as any)?.message);
  }

  console.log(
    `[cron/espn-keepalive] users=${users.length} healthy=${healthy} unhealthy=${unhealthy} credsRefreshed=${refreshedCreds} seasonsBumped=${seasonsBumped} rollovers=${rollovers}`
  );
  await recordCronHeartbeat("espn-keepalive", `users=${users.length} healthy=${healthy} unhealthy=${unhealthy} bumped=${seasonsBumped} rollovers=${rollovers}`);
  return NextResponse.json({ ok: true, users: users.length, healthy, unhealthy, refreshedCreds, seasonsBumped, rollovers });
}
