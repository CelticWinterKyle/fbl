// FBL Background Service Worker
// Syncs ESPN league data to FBL automatically — no need to visit ESPN.
//
// Flow:
//  1. fbl-sync.js (on familybizfootball.com) sends FBL_ESPN_CONFIG with the leagueId
//  2. We store it and trigger an immediate sync
//  3. chrome.alarms keeps it refreshed every hour
//  4. espn-sync.js (on fantasy.espn.com) can also trigger a sync as a fallback

const FBL_RELAY = "https://familybizfootball.com/api/espn/relay";
const FBL_TOKEN_URL = "https://familybizfootball.com/api/espn/relay-token";
const ESPN_API  = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

// Returns a valid relay auth, re-minting from the FBL API when the stored one
// is missing or expiring within 10 minutes. Works whenever the user has an
// active Clerk session cookie in this browser (credentials: "include" +
// host_permissions), so hourly background sync keeps itself authenticated
// instead of waiting for the next FBL page visit.
async function getRelayAuth() {
  const { relayAuth } = await chrome.storage.local.get("relayAuth");
  const now = Math.floor(Date.now() / 1000);
  if (relayAuth?.token && relayAuth.expiresAt && relayAuth.expiresAt - now > 600) {
    return relayAuth;
  }
  try {
    const resp = await fetch(FBL_TOKEN_URL, { credentials: "include", cache: "no-store" });
    if (resp.ok) {
      const j = await resp.json();
      if (j.ok && j.token) {
        const fresh = { token: j.token, expiresAt: j.expiresAt };
        await chrome.storage.local.set({ relayAuth: fresh });
        console.log("[FBL] Re-minted relay token");
        return fresh;
      }
    }
  } catch (e) {
    console.log("[FBL] Token re-mint failed:", e?.message);
  }
  return relayAuth?.token ? relayAuth : null;
}

function currentNflSeason() {
  // Sept (month index 8) cutoff — matches the server's lib/season.ts so the
  // extension and backend never disagree on which season to request.
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
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
    relayToFBL({ leagueId: msg.leagueId, season: msg.season, data: stripEspnPayload(msg.data) })
      .catch((e) => console.error("[FBL] Relay error:", e));
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

  const relayAuth = await getRelayAuth();
  if (!relayAuth?.token) {
    console.log("[FBL] No relay token and re-mint failed; user needs to visit FBL page signed in");
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

      await relayToFBL({ leagueId, season, data: stripEspnPayload(data) });
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

// Stash auto-detected leagues so fbl-sync.js reports them (via a signed relay
// token) on the user's next visit to FBL. Previously this POSTed directly with an
// "x-fbl-uid" header reading an `fblUserId` that was never written anywhere — a
// dead no-op the server (which only accepts x-fbl-relay-token) rejected anyway.
async function reportDiscoveredLeagues(leagues) {
  if (!Array.isArray(leagues) || leagues.length === 0) return;
  const { espnDiscovered } = await chrome.storage.local.get("espnDiscovered");
  const byId = new Map((espnDiscovered ?? []).map((l) => [String(l.leagueId), l]));
  for (const l of leagues) {
    if (l && l.leagueId != null) byId.set(String(l.leagueId), l);
  }
  await chrome.storage.local.set({ espnDiscovered: Array.from(byId.values()) });
  console.log("[FBL] Stashed", leagues.length, "discovered ESPN leagues for next sync");
}

// ── Relay ────────────────────────────────────────────────────────────────────

async function relayToFBL({ leagueId, season, data }) {
  const relayAuth = await getRelayAuth();
  if (!relayAuth?.token) {
    console.log("[FBL] No relay token and re-mint failed; user needs to visit FBL page signed in");
    return;
  }

  // Reject if token is expired (add 60s grace period)
  const now = Math.floor(Date.now() / 1000);
  if (relayAuth.expiresAt && now > relayAuth.expiresAt + 60) {
    console.log("[FBL] Relay token expired and re-mint failed; visit FBL page to refresh");
    return;
  }

  // Include the user's ESPN account id (SWID) so the server can auto-select
  // which team in this league is theirs (no manual "pick your team" step).
  let swid = null;
  try {
    const c = await chrome.cookies.get({ url: "https://fantasy.espn.com", name: "SWID" });
    swid = c?.value ?? null;
  } catch {}

  const resp = await fetch(FBL_RELAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-fbl-relay-token": relayAuth.token,
    },
    body: JSON.stringify({ leagueId, season, data, swid }),
  });

  if (resp.ok) {
    console.log("[FBL] Relay success for league", leagueId);
  } else {
    const text = await resp.text().catch(() => "");
    console.log("[FBL] Relay failed:", resp.status, text);
  }
}
