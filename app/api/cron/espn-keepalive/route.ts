// ─── /api/cron/espn-keepalive ─────────────────────────────────────────────────
// Vercel Cron (nightly): walk every user with an ESPN connection, exercise the
// Disney ONESITE refresh path, persist any newly-minted espn_s2, and record
// per-connection health. This is what makes "stays connected" true by
// construction instead of depending on the user's desktop Chrome being open.

import { NextRequest, NextResponse } from "next/server";
import { listEspnUsers, saveEspnHealth } from "@/lib/leagueRegistry";
import {
  readEspnConnections,
  updateEspnConnectionCreds,
} from "@/lib/tokenStore/index";
import { exchangeEspnOneSiteToken, validateEspnLeague } from "@/lib/adapters/espn";

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

  for (const userId of users) {
    let conns;
    try {
      conns = await readEspnConnections(userId);
    } catch {
      continue;
    }
    for (const conn of conns) {
      try {
        // 1. Re-mint the ONESITE token's access token (and espn_s2 when the
        //    account has one) so credentials never age out unnoticed.
        if (conn.espnToken) {
          const fresh = await exchangeEspnOneSiteToken(conn.espnToken);
          if (fresh && (fresh.espnS2 || fresh.swid)) {
            await updateEspnConnectionCreds(userId, conn.leagueId, {
              espnS2: fresh.espnS2 ?? conn.espnS2,
              swid: fresh.swid ?? conn.swid,
            });
            refreshedCreds++;
          }
        }

        // 2. Verify the league actually answers with these creds
        //    (validateEspnLeague throws when it doesn't).
        const creds =
          conn.espnS2 || conn.swid || conn.espnToken
            ? { espnS2: conn.espnS2, swid: conn.swid, espnToken: conn.espnToken }
            : undefined;
        await validateEspnLeague(conn.leagueId, conn.season, creds);

        await saveEspnHealth(userId, conn.leagueId, { ok: true, checkedAt: Date.now() });
        healthy++;
      } catch (e) {
        unhealthy++;
        await saveEspnHealth(userId, conn.leagueId, {
          ok: false,
          checkedAt: Date.now(),
          error: String((e as any)?.message ?? "unknown").slice(0, 200),
        });
      }
    }
  }

  console.log(
    `[cron/espn-keepalive] users=${users.length} healthy=${healthy} unhealthy=${unhealthy} credsRefreshed=${refreshedCreds}`
  );
  return NextResponse.json({ ok: true, users: users.length, healthy, unhealthy, refreshedCreds });
}
