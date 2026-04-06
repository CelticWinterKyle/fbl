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
  if (msg.type === "FBL_ESPN_CONFIG") {
    // Received from fbl-sync.js on familybizfootball.com
    chrome.storage.local.set({ espnLeagueId: msg.leagueId, espnSeason: msg.season });
    syncFromBackground().catch((e) => console.error("[FBL] Sync error:", e));
  }

  if (msg.type === "ESPN_RELAY") {
    // Received from espn-sync.js on fantasy.espn.com (fallback path)
    chrome.storage.local.set({ espnLeagueId: msg.leagueId, espnSeason: msg.season });
    relayToFBL(msg).catch((e) => console.error("[FBL] Relay error:", e));
  }
});

// ── Background sync ──────────────────────────────────────────────────────────
// Fetches ESPN directly using the browser's stored cookies (via credentials:include).
// Chrome extensions with host_permissions bypass CORS, so this works from the
// service worker without the user needing to be on an ESPN page.

async function syncFromBackground() {
  const { espnLeagueId, espnSeason } = await chrome.storage.local.get([
    "espnLeagueId",
    "espnSeason",
  ]);

  if (!espnLeagueId) {
    console.log("[FBL] No ESPN league stored yet — waiting for FBL page visit");
    return;
  }

  const { fblUserId } = await chrome.storage.local.get("fblUserId");
  const fblUid = fblUserId ?? null;
  if (!fblUid) {
    console.log("[FBL] No fblUserId — user not signed in to FBL yet");
    return;
  }

  const season = espnSeason ?? currentNflSeason();
  const views  = ["mTeam", "mMatchup", "mMatchupScore", "mRoster", "mSettings", "mStandings"];
  const params = new URLSearchParams();
  views.forEach((v) => params.append("view", v));
  const url = `${ESPN_API}/${season}/segments/0/leagues/${espnLeagueId}?${params}`;

  try {
    // credentials:"include" sends the user's ESPN browser cookies automatically.
    // Extensions with host_permissions for espn.com can make these credentialed requests.
    const resp = await fetch(url, {
      credentials: "include",
      headers: {
        Origin:  "https://fantasy.espn.com",
        Referer: "https://fantasy.espn.com/",
      },
    });

    if (!resp.ok) {
      console.log("[FBL] ESPN fetch failed:", resp.status);
      return;
    }

    const data = await resp.json();

    // Private leagues return no teams when fetched from the service worker
    // (Origin is chrome-extension://, not fantasy.espn.com — ESPN rejects it).
    // Skip the relay to preserve the valid data synced by the content script.
    if (!data.teams || data.teams.length === 0) {
      console.log("[FBL] ESPN returned no teams — private league auth failed from background, skipping relay");
      return;
    }

    await relayToFBL({ leagueId: espnLeagueId, season, data, fblUid });
  } catch (e) {
    console.error("[FBL] ESPN fetch error:", e);
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
