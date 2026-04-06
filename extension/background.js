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
    // Received from espn-sync.js on fantasy.espn.com
    relayToFBL(msg).catch((e) => console.error("[FBL] Relay error:", e));
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

      await relayToFBL({ leagueId, season, data, fblUid });
    } catch (e) {
      console.error(`[FBL] ESPN fetch error for league ${leagueId}:`, e);
    }
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
