// ─── /api/cron/push-dispatch ──────────────────────────────────────────────────
// Every 5 minutes: turn game events into web-push notifications for subscribed
// users (docs/PUSH_NOTIFICATIONS.md).
//
//   - TD alerts: diff the globally-cached scoring feed against a cursor, match
//     fresh touchdown plays to each user's starters (server-side version of
//     the FeedContent membership logic). Game windows only.
//   - Close-game alerts: when any game is in the 4th quarter, users whose
//     fantasy matchup is within one score get one nudge per league per day.
//   - Finals: when the last window of the fantasy week ends (Tuesday ET),
//     one result recap per league.
//
// All sends are best-effort; one user failing never blocks the rest.
// Auth: "Authorization: Bearer ${CRON_SECRET}" (same as the other crons).
// BRIGHT LINE: no odds, lines, or promo content in notifications. Ever.

import { NextRequest, NextResponse } from "next/server";
import { withCache, TTL } from "@/lib/cache";
import { isNflGameWindow } from "@/lib/gameWindow";
import { fetchNflScoringFeed, type NflScoringFeed } from "@/lib/nflPlays";
import {
  listPushUsers,
  readPushPrefs,
  sendPushToUser,
  isPushConfigured,
  type PushPayload,
} from "@/lib/push";
import {
  buildMembership,
  freshPlays,
  tdPayloadsFor,
  isCloseMatchup,
  closeGamePayload,
  finalPayload,
  isLineupAlertWindow,
  lineupPayloadsFor,
  recapPayload,
  readCursor,
  writeCursor,
  markSentOnce,
  type RosterLite,
} from "@/lib/pushDetect";
import {
  readUserLeagues,
  readSleeperLeagues,
  readEspnConnections,
  readMyTeam,
} from "@/lib/tokenStore/index";
import { getRosterForUser } from "@/lib/rosterData";
import { getYahooData, getSleeperData, getEspnData, isError } from "@/lib/leagueData";
import { recordCronHeartbeat, reportCriticalError } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_USERS_PER_RUN = 500;
const PLAYS_CURSOR_KEY = "push:cursor:plays";
const WINDOW_FLAG_KEY = "push:flag:window";
const DAY_SECONDS = 24 * 3600;
const WEEK_SECONDS = 8 * DAY_SECONDS;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function etNow(): { day: string; date: string } {
  const now = new Date();
  return {
    day: now.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" }),
    date: now.toLocaleDateString("en-CA", { timeZone: "America/New_York" }), // YYYY-MM-DD
  };
}

// ─── Per-user league context ──────────────────────────────────────────────────

type UserLeague = {
  platform: "yahoo" | "sleeper" | "espn";
  leagueKey: string;
  teamKey: string;
  espnConn?: { leagueId: string; season: number; espnS2?: string; swid?: string; espnToken?: string };
};

async function listUserLeagues(userId: string): Promise<UserLeague[]> {
  const [yahooLeagues, sleeperLeagues, espnConns] = await Promise.all([
    readUserLeagues(userId).catch(() => [] as string[]),
    readSleeperLeagues(userId).catch(() => [] as string[]),
    readEspnConnections(userId).catch(() => []),
  ]);

  const out: UserLeague[] = [];
  for (const lk of yahooLeagues) {
    const myTeam = await readMyTeam(userId, "yahoo", lk);
    if (myTeam?.teamKey) out.push({ platform: "yahoo", leagueKey: lk, teamKey: myTeam.teamKey });
  }
  for (const lid of sleeperLeagues) {
    const myTeam = await readMyTeam(userId, "sleeper", lid);
    if (myTeam?.teamKey) out.push({ platform: "sleeper", leagueKey: lid, teamKey: myTeam.teamKey });
  }
  for (const conn of espnConns) {
    const myTeam = await readMyTeam(userId, "espn", conn.leagueId);
    if (myTeam?.teamKey) {
      out.push({
        platform: "espn",
        leagueKey: conn.leagueId,
        teamKey: myTeam.teamKey,
        espnConn: conn,
      });
    }
  }
  return out;
}

async function rostersFor(userId: string, leagues: UserLeague[]): Promise<RosterLite[]> {
  const results = await Promise.all(
    leagues.map(async (l) => {
      try {
        const r: any = await getRosterForUser(userId, {
          platform: l.platform,
          teamKey: l.teamKey,
          leagueKey: l.leagueKey,
          requestedWeek: null,
        });
        if (!r?.ok || !Array.isArray(r.starters)) return null;
        return {
          leagueId: l.leagueKey,
          leagueName: l.leagueKey,
          starters: r.starters.map((p: any) => ({
            name: String(p?.name ?? ""),
            position: String(p?.position ?? ""),
            team: String(p?.team ?? ""),
            status: typeof p?.status === "string" ? p.status : null,
            kickoffMs: typeof p?.kickoffMs === "number" ? p.kickoffMs : null,
          })),
        } satisfies RosterLite;
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is RosterLite => r !== null);
}

type MyMatchupNow = {
  leagueKey: string;
  leagueName: string;
  week: number;
  myPts: number;
  oppPts: number;
};

async function matchupsFor(userId: string, leagues: UserLeague[]): Promise<MyMatchupNow[]> {
  const results = await Promise.all(
    leagues.map(async (l) => {
      try {
        const data =
          l.platform === "yahoo"
            ? await getYahooData(userId, l.leagueKey)
            : l.platform === "sleeper"
              ? await getSleeperData(l.leagueKey)
              : await getEspnData(l.espnConn!, undefined, userId);
        if (!data || isError(data)) return null;
        const m = data.matchups.find(
          (mu) => mu.teamA.key === l.teamKey || mu.teamB.key === l.teamKey
        );
        if (!m) return null;
        const mine = m.teamA.key === l.teamKey ? m.teamA : m.teamB;
        const opp = m.teamA.key === l.teamKey ? m.teamB : m.teamA;
        return {
          leagueKey: l.leagueKey,
          leagueName: data.leagueName || l.leagueKey,
          week: data.currentWeek,
          myPts: mine.points,
          oppPts: opp.points,
        } satisfies MyMatchupNow;
      } catch {
        return null;
      }
    })
  );
  return results.filter((m): m is MyMatchupNow => m !== null);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!isPushConfigured()) {
    await recordCronHeartbeat("push-dispatch", "skipped: push not configured");
    return NextResponse.json({ ok: true, skipped: "push_not_configured" });
  }

  let inWindow = isNflGameWindow();
  const wasInWindow = ((await readCursor(WINDOW_FLAG_KEY)) ?? 0) === 1;
  const { day, date } = etNow();

  // Hold the window open while the feed still shows recent plays: a late
  // Monday night game (10:15 PM West Coast kick plus overtime) outlives the
  // scheduled window, and finals sent mid-game would carry non-final scores
  // that markSentOnce then makes permanent. One quiet feed read releases it.
  if (!inWindow && wasInWindow) {
    try {
      const feed = await withCache<NflScoringFeed>(
        "nfl:scoringplays:current",
        TTL.LIVE_SCORE,
        fetchNflScoringFeed
      );
      const cutoff = Date.now() - 45 * 60 * 1000;
      if (feed.plays.some((p) => (p.wallclockMs ?? p.sortMs) >= cutoff)) {
        inWindow = true;
      }
    } catch {
      // Feed unavailable: fall through to the scheduled window boundary.
    }
  }

  await writeCursor(WINDOW_FLAG_KEY, inWindow ? 1 : 0);
  const windowJustEnded = wasInWindow && !inWindow;
  // Fantasy weeks wrap when Monday Night Football ends. The 2 AM ET
  // spillover in isNflGameWindow means Monday's window always closes on
  // Tuesday; Sunday's window now closes Monday morning, so gating strictly
  // on Tue keeps finals from firing before MNF has been played.
  const finalsDue = windowJustEnded && day === "Tue";
  // Lineup warnings fire BEFORE kickoff windows (Sun morning, pre-Thu/Mon).
  const lineupWindow = isLineupAlertWindow();

  if (!inWindow && !finalsDue && !lineupWindow) {
    await recordCronHeartbeat("push-dispatch", "skipped: outside windows");
    return NextResponse.json({ ok: true, skipped: "outside_game_window" });
  }

  const allUsers = await listPushUsers();
  if (allUsers.length > MAX_USERS_PER_RUN) {
    // Truncation means real users silently get no notifications: page it.
    void reportCriticalError(
      "push-dispatch-cap",
      `${allUsers.length} push users exceed the ${MAX_USERS_PER_RUN}/run cap; users beyond the cap get nothing. Raise the cap or shard the cron.`
    );
  }
  const users = allUsers.slice(0, MAX_USERS_PER_RUN);
  if (users.length === 0) {
    await recordCronHeartbeat("push-dispatch", "no subscribed users");
    return NextResponse.json({ ok: true, users: 0 });
  }

  // One globally-cached feed read per tick (same key the Live Feed uses).
  let fresh: Awaited<ReturnType<typeof freshPlays>>["fresh"] = [];
  let lateGame = false;
  let pendingCursor: number | null = null;
  if (inWindow) {
    const feed = await withCache<NflScoringFeed>(
      "nfl:scoringplays:current",
      TTL.LIVE_SCORE,
      fetchNflScoringFeed
    );
    const cursor = await readCursor(PLAYS_CURSOR_KEY);
    const diff = freshPlays(feed.plays, cursor ?? Number.MAX_SAFE_INTEGER);
    if (cursor === null) {
      // First run: set the cursor without replaying the day's plays.
      await writeCursor(PLAYS_CURSOR_KEY, Math.max(0, ...feed.plays.map((p) => p.sortMs)));
    } else {
      fresh = diff.fresh;
      // The cursor is advanced AFTER the send loop below: if this run dies
      // midway, the next tick replays the batch and the per-play notification
      // tag collapses any duplicates on devices that already got them.
      pendingCursor = diff.nextCursor > cursor ? diff.nextCursor : null;
    }
    const cutoff = Date.now() - 30 * 60 * 1000;
    lateGame = feed.plays.some((p) => p.period >= 4 && (p.wallclockMs ?? p.sortMs) >= cutoff);
  }

  const stats = { users: users.length, td: 0, close: 0, final: 0, lineup: 0, recap: 0, pruned: 0 };

  for (const userId of users) {
    try {
      const prefs = await readPushPrefs(userId);
      if (!prefs.td && !prefs.closeGame && !prefs.final && !prefs.lineup && !prefs.recap) continue;

      const leagues = await listUserLeagues(userId);
      if (leagues.length === 0) continue;

      const payloads: PushPayload[] = [];

      // TD matching and lineup warnings both need the user's starters; fetch once.
      const wantTd = prefs.td && fresh.length > 0;
      const wantLineup = prefs.lineup && lineupWindow;
      const rosters = wantTd || wantLineup ? await rostersFor(userId, leagues) : [];

      if (wantTd) {
        payloads.push(...tdPayloadsFor(buildMembership(rosters), fresh));
      }

      if (wantLineup) {
        for (const c of lineupPayloadsFor(rosters, Date.now())) {
          if (await markSentOnce(`push:sent:lineup:${userId}:${c.nameKey}:${date}`, DAY_SECONDS)) {
            payloads.push(c.payload);
          }
        }
      }

      if ((prefs.closeGame && inWindow && lateGame) || ((prefs.final || prefs.recap) && finalsDue)) {
        const matchups = await matchupsFor(userId, leagues);
        for (const m of matchups) {
          if (prefs.closeGame && inWindow && lateGame && isCloseMatchup(m.myPts, m.oppPts)) {
            if (await markSentOnce(`push:sent:close:${userId}:${m.leagueKey}:${date}`, DAY_SECONDS)) {
              payloads.push(closeGamePayload(m.leagueKey, m.leagueName, m.myPts, m.oppPts));
            }
          }
          if (prefs.final && finalsDue && Math.max(m.myPts, m.oppPts) > 0) {
            if (await markSentOnce(`push:sent:final:${userId}:${m.leagueKey}:${m.week}`, WEEK_SECONDS)) {
              payloads.push(finalPayload(m.leagueKey, m.leagueName, m.myPts, m.oppPts));
            }
          }
        }

        // One aggregate recap per week, after the last window ends.
        if (prefs.recap && finalsDue && matchups.length > 0) {
          const week = matchups.reduce((max, m) => Math.max(max, m.week), 0);
          const recap = recapPayload(matchups, week);
          if (recap && (await markSentOnce(`push:sent:recap:${userId}:${week}`, WEEK_SECONDS))) {
            payloads.push(recap);
          }
        }
      }

      for (const payload of payloads) {
        const result = await sendPushToUser(userId, payload);
        stats.pruned += result.pruned;
        if (payload.tag?.startsWith("td-")) stats.td += result.sent > 0 ? 1 : 0;
        else if (payload.tag?.startsWith("close-")) stats.close += result.sent > 0 ? 1 : 0;
        else if (payload.tag?.startsWith("final-")) stats.final += result.sent > 0 ? 1 : 0;
        else if (payload.tag?.startsWith("lineup-")) stats.lineup += result.sent > 0 ? 1 : 0;
        else if (payload.tag?.startsWith("recap-")) stats.recap += result.sent > 0 ? 1 : 0;
      }
    } catch (e: any) {
      console.error(`[push-dispatch] user ${userId} failed:`, e?.message);
    }
  }

  // Every user has been processed; now it is safe to move past these plays.
  if (pendingCursor !== null) await writeCursor(PLAYS_CURSOR_KEY, pendingCursor);

  await recordCronHeartbeat("push-dispatch", `users=${stats.users} td=${stats.td} lineup=${stats.lineup} recap=${stats.recap}`);
  return NextResponse.json({ ok: true, ...stats, freshPlays: fresh.length, finalsDue });
}
