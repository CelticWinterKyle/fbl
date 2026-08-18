// ─── ESPN connection verification ─────────────────────────────────────────────
//
// One implementation of "is this user's ESPN connection actually working",
// shared by the nightly keepalive cron and the on-demand check on the Leagues
// page. It must stay shared: the whole reason the connect page could show a
// green "syncing" state while every league was in fact unreadable is that the
// UI was reporting something else entirely (that the extension was installed).
//
// Note what this checks and what it does not. The extension relay pushes a
// snapshot that the app serves for six hours WITHOUT contacting ESPN, so while
// a fresh snapshot exists the app looks healthy no matter what. This function
// deliberately bypasses that and exercises the stored credentials, which is
// what has to work on a phone, in crons, and any time the desktop has not
// synced recently.

import {
  readEspnConnections,
  updateEspnConnectionCreds,
  updateEspnConnectionSeason,
} from "@/lib/tokenStore/index";
import { exchangeEspnOneSiteToken, validateEspnLeague } from "@/lib/adapters/espn";
import { saveEspnHealth } from "@/lib/leagueRegistry";
import { currentNflSeason } from "@/lib/season";

export type EspnLeagueVerdict = {
  leagueId: string;
  ok: boolean;
  /** ESPN's own words when it refused, truncated. */
  error?: string;
  /** Set when the stored season was behind and the league answered at the new one. */
  seasonBumped?: number;
  credsRefreshed?: boolean;
};

/**
 * Exercise every stored ESPN connection for one user and persist the result.
 * Never throws: a user whose connections cannot even be read yields [].
 */
export async function verifyEspnForUser(userId: string): Promise<EspnLeagueVerdict[]> {
  let conns;
  try {
    conns = await readEspnConnections(userId);
  } catch {
    return [];
  }

  const nflSeason = currentNflSeason();
  const verdicts: EspnLeagueVerdict[] = [];

  for (const conn of conns) {
    const verdict: EspnLeagueVerdict = { leagueId: conn.leagueId, ok: false };

    // 1. Re-mint the ONESITE token's access token (and espn_s2 when the
    //    account has one) so credentials never age out unnoticed. The minted
    //    accessToken MUST flow into validation below: token-only accounts (no
    //    espn_s2) otherwise validate with the expired token embedded in the
    //    stored cookie and read unhealthy forever.
    let fresh: Awaited<ReturnType<typeof exchangeEspnOneSiteToken>> = null;
    try {
      if (conn.espnToken) {
        fresh = await exchangeEspnOneSiteToken(conn.espnToken);
        // s2Enc: whether the stored espn_s2 still carries %XX escapes (the raw
        // cookie form ESPN accepts) or was decoded somewhere on the way in.
        // Shape booleans only; never values.
        console.log(
          `[espnVerify] ${conn.leagueId} stored: s2=${!!conn.espnS2} s2Enc=${
            conn.espnS2 ? /%[0-9A-Fa-f]{2}/.test(conn.espnS2) : "n/a"
          } swidBraced=${conn.swid ? conn.swid.startsWith("{") : "n/a"} token=${!!conn.espnToken};`,
          "exchange:",
          JSON.stringify(fresh?._debug ?? null)
        );
        if (fresh && (fresh.espnS2 || fresh.swid)) {
          await updateEspnConnectionCreds(userId, conn.leagueId, {
            espnS2: fresh.espnS2 ?? conn.espnS2,
            swid: fresh.swid ?? conn.swid,
          });
          verdict.credsRefreshed = true;
        }
      }
    } catch {
      // Exchange hiccup: validation below still runs on stored creds.
    }

    const creds =
      conn.espnS2 || conn.swid || conn.espnToken || fresh
        ? {
            espnS2: fresh?.espnS2 ?? conn.espnS2,
            swid: fresh?.swid ?? conn.swid,
            espnToken: conn.espnToken,
            accessToken: fresh?.accessToken,
          }
        : undefined;

    // 2. Verify the league actually answers with these creds.
    try {
      await validateEspnLeague(conn.leagueId, conn.season, creds);
      await saveEspnHealth(userId, conn.leagueId, { ok: true, checkedAt: Date.now() });
      verdict.ok = true;
    } catch (e) {
      const error = String((e as any)?.message ?? "unknown").slice(0, 200);
      await saveEspnHealth(userId, conn.leagueId, { ok: false, checkedAt: Date.now(), error });
      verdict.error = error;
    }

    // 3. Season rollover self-heal: if the stored season is behind the
    //    calendar, probe at the current season and persist the bump once ESPN
    //    has reactivated it. ESPN serves the OLD season forever without
    //    erroring, so without this every pre-September connection silently
    //    shows last year all season. Runs even when validation failed (a
    //    bumped season is often exactly what fixes it); a failed probe is
    //    expected until the commissioner reactivates and never marks the
    //    connection unhealthy.
    if (conn.season < nflSeason) {
      try {
        const info = await validateEspnLeague(conn.leagueId, nflSeason, creds);
        await updateEspnConnectionSeason(userId, conn.leagueId, info.season);
        verdict.seasonBumped = info.season;
      } catch {
        // League not reactivated for the new season yet.
      }
    }

    verdicts.push(verdict);
  }

  return verdicts;
}
