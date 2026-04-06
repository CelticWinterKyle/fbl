// FBL Background Service Worker
// Syncs ESPN league data to FBL automatically — no need to visit ESPN.
//
// Flow:
//  1. fbl-sync.js (on familybizfootball.com) sends FBL_ESPN_CONFIG with the leagueId
//  2. We store it and trigger an immediate sync
//  3. chrome.alarms keeps it refreshed every hour
//  4. espn-sync.js (on fantasy.espn.com) can also trigger a sync as a fallback

const FBL_RELAY = "https://familybizfootball.com/api/espn/relay";
const ESPN_API  = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

function currentNflSeason() {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

// ── Setup ────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("espn-sync", { delayInMinutes: 1, periodInMinutes: 60 });
});

// ── Alarm handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "espn-sync") {
    syncFromBackground().catch((e) => console.error("[FBL] Background sync error:", e));
  }
});

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "FBL_ESPN_CONFIG_ALL") {
    // Received from fbl-sync.js — array of all ESPN leagues
    chrome.storage.local.set({ espnLeagues: msg.leagues });
    syncFromBackground().catch((e) => console.error("[FBL] Sync error:", e));
  }

  if (msg.type === "FBL_ESPN_CONFIG") {
    // Legacy single-league message — wrap into array
    const leagues = [{ leagueId: msg.leagueId, season: msg.season }];
    chrome.storage.local.set({ espnLeagues: leagues });
    syncFromBackground().catch((e) => console.error("[FBL] Sync error:", e));
  }

  if (msg.type === "ESPN_RELAY") {
    // Received from espn-sync.js on fantasy.espn.com — strip before relaying
    const stripped = { ...msg, data: stripEspnPayload(msg.data) };
    relayToFBL(stripped).catch((e) => console.error("[FBL] Relay error:", e));
  }

  if (msg.type === "ESPN_USER_LEAGUES") {
    // Received from espn-sync.js — auto-detected leagues for this user
    reportDiscoveredLeagues(msg.leagues).catch((e) => console.error("[FBL] League report error:", e));
  }
});

// ── Background sync ──────────────────────────────────────────────────────────
// Fetches ESPN directly using the browser's stored cookies (via credentials:include).
// Chrome extensions with host_permissions bypass CORS, so this works from the
// service worker without the user needing to be on an ESPN page.

async function syncFromBackground() {
  const { espnLeagues } = await chrome.storage.local.get("espnLeagues");

  if (!espnLeagues || espnLeagues.length === 0) {
    console.log("[FBL] No ESPN leagues stored yet — waiting for FBL page visit");
    return;
  }

  const { fblUserId } = await chrome.storage.local.get("fblUserId");
  const fblUid = fblUserId ?? null;
  if (!fblUid) {
    console.log("[FBL] No fblUserId — user not signed in to FBL yet");
    return;
  }

  const views  = ["mTeam", "mMatchup", "mMatchupScore", "mRoster", "mSettings", "mStandings"];
  const params = new URLSearchParams();
  views.forEach((v) => params.append("view", v));

  for (const { leagueId, season: leagueSeason } of espnLeagues) {
    const season = leagueSeason ?? currentNflSeason();
    const url = `${ESPN_API}/${season}/segments/0/leagues/${leagueId}?${params}`;

    try {
      const resp = await fetch(url, {
        credentials: "include",
        headers: {
          Origin:  "https://fantasy.espn.com",
          Referer: "https://fantasy.espn.com/",
        },
      });

      if (!resp.ok) {
        console.log(`[FBL] ESPN fetch failed for league ${leagueId}:`, resp.status);
        continue;
      }

      const data = await resp.json();

      if (!data.teams || data.teams.length === 0) {
        console.log(`[FBL] ESPN returned no teams for league ${leagueId} — private league, skipping background relay`);
        continue;
      }

      await relayToFBL({ leagueId, season, data: stripEspnPayload(data), fblUid });
    } catch (e) {
      console.error(`[FBL] ESPN fetch error for league ${leagueId}:`, e);
    }
  }
}

// ── Payload stripper ─────────────────────────────────────────────────────────
// ESPN returns ~10-20MB of JSON. Vercel's limit is 4.5MB.
// Keep only the fields that parseEspnLeagueRaw and parseEspnRosterFromRaw use.

function stripEspnPayload(data) {
  const period = data?.scoringPeriodId;

  function stripRosterEntry(e) {
    if (!e) return e;
    const ppe = e.playerPoolEntry;
    const p = ppe?.player;
    return {
      lineupSlotId: e.lineupSlotId,
      playerId: e.playerId,
      acquisitionType: e.acquisitionType,
      playerPoolEntry: ppe ? {
        acquisitionType: ppe.acquisitionType,
        lineupLocked: ppe.lineupLocked,
        playerPoolEntryId: ppe.playerPoolEntryId,
        onTeamId: ppe.onTeamId,
        appliedStatTotal: ppe.appliedStatTotal,
        player: p ? {
          id: p.id,
          fullName: p.fullName,
          defaultPositionId: p.defaultPositionId,
          proTeamId: p.proTeamId,
          injured: p.injured,
          injuryStatus: p.injuryStatus,
          // Keep stats for current period only (strips historical bloat)
          stats: (p.stats ?? []).filter(
            (s) => !period || Math.abs(s.scoringPeriodId - period) <= 1
          ).map((s) => ({
            scoringPeriodId: s.scoringPeriodId,
            statSourceId: s.statSourceId,
            appliedTotal: s.appliedTotal,
          })),
        } : undefined,
      } : undefined,
    };
  }

  function stripMatchupSide(side) {
    if (!side) return undefined;
    return {
      teamId: side.teamId,
      totalPoints: side.totalPoints,
      totalProjectedPointsLive: side.totalProjectedPointsLive,
      winner: side.winner,
      rosterForCurrentScoringPeriod: side.rosterForCurrentScoringPeriod ? {
        entries: (side.rosterForCurrentScoringPeriod.entries ?? []).map(stripRosterEntry),
      } : undefined,
    };
  }

  return {
    id: data.id,
    seasonId: data.seasonId,
    scoringPeriodId: data.scoringPeriodId,
    gameCode: data.gameCode,
    status: data.status,
    settings: data.settings,
    members: (data.members ?? []).map((m) => ({
      id: m.id,
      displayName: m.displayName,
      firstName: m.firstName,
      lastName: m.lastName,
    })),
    teams: (data.teams ?? []).map((t) => ({
      id: t.id,
      abbrev: t.abbrev,
      location: t.location,
      nickname: t.nickname,
      name: t.name,
      owners: t.owners,
      record: t.record,
      points: t.points,
      projectedPoints: t.projectedPoints,
      roster: t.roster ? {
        entries: (t.roster.entries ?? []).map(stripRosterEntry),
      } : undefined,
    })),
    schedule: (data.schedule ?? []).map((s) => ({
      id: s.id,
      matchupPeriodId: s.matchupPeriodId,
      winner: s.winner,
      playoffTierType: s.playoffTierType,
      home: stripMatchupSide(s.home),
      away: stripMatchupSide(s.away),
    })),
  };
}

// ── Discovered leagues reporter ──────────────────────────────────────────────

async function reportDiscoveredLeagues(leagues) {
  const { fblUserId } = await chrome.storage.local.get("fblUserId");
  if (!fblUserId) return;

  const resp = await fetch(`${FBL_RELAY.replace("/relay", "/discovered-leagues")}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fbl-uid": fblUserId,
    },
    body: JSON.stringify({ leagues }),
  });

  if (resp.ok) {
    console.log("[FBL] Reported", leagues.length, "discovered ESPN leagues");
  }
}

// ── Relay ────────────────────────────────────────────────────────────────────

async function relayToFBL({ leagueId, season, data, fblUid: providedUid }) {
  let fblUid = providedUid;
  if (!fblUid) {
    const { fblUserId } = await chrome.storage.local.get("fblUserId");
    fblUid = fblUserId ?? null;
  }
  if (!fblUid) return;

  const resp = await fetch(FBL_RELAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fbl-uid": fblUid,
    },
    body: JSON.stringify({ leagueId, season, data }),
  });

  if (resp.ok) {
    console.log("[FBL] Relay success for league", leagueId);
  } else {
    const text = await resp.text().catch(() => "");
    console.log("[FBL] Relay failed:", resp.status, text);
  }
}
