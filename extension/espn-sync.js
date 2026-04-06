// FBL ESPN Sync — content script on fantasy.espn.com
// 1. Discovers all the user's ESPN Fantasy leagues (auto-detect)
// 2. Relays private league data for any league currently in the URL

const FBL_RELAY = "https://familybizfootball.com/api/espn/relay";
const ESPN_API  = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons";

function currentNflSeason() {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

function getLeagueIdFromUrl() {
  try {
    return new URL(location.href).searchParams.get("leagueId") ?? null;
  } catch {
    return null;
  }
}

// ── Auto-detect all the user's ESPN leagues ───────────────────────────────────

async function discoverUserLeagues() {
  const baseSeason = currentNflSeason();
  const discovered = new Map(); // leagueId -> season

  // Method 1: Grab leagueId + season directly from the current URL — always correct.
  // ESPN may label an upcoming season ahead (e.g. seasonId=2026 in April 2026),
  // so we read the seasonId param rather than computing it ourselves.
  try {
    const params     = new URL(location.href).searchParams;
    const urlLeagueId = params.get("leagueId");
    const urlSeason   = params.get("seasonId");
    if (urlLeagueId) {
      const season = urlSeason ? Number(urlSeason) : baseSeason;
      discovered.set(urlLeagueId, season);
      console.log("[FBL] League from URL:", urlLeagueId, "season:", season);
    }
  } catch {}

  // Method 2: mUserNFL API — try both computed season and next year
  // (ESPN can assign the same league to season+1 before the NFL season starts)
  for (const yr of [baseSeason, baseSeason + 1]) {
    try {
      const resp = await fetch(
        `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${yr}?view=mUserNFL`,
        { credentials: "include" }
      );
      if (!resp.ok) {
        console.log("[FBL] mUserNFL season", yr, "failed:", resp.status);
        continue;
      }
      const data = await resp.json();
      const prefs = data?.user?.preferences ?? [];
      console.log("[FBL] mUserNFL season", yr, "preferences:", prefs.length);
      for (const p of prefs) {
        if (p.type === "LEAGUE_JOINED" && p.entityId) {
          const lid = String(p.entityId);
          if (!discovered.has(lid)) discovered.set(lid, yr);
        }
      }
    } catch (e) {
      console.error("[FBL] mUserNFL season", yr, "error:", e);
    }
  }

  const leagues = [...discovered.entries()].map(([leagueId, season]) => ({ leagueId, season }));
  console.log("[FBL] Total discovered:", leagues.map((l) => l.leagueId).join(", ") || "(none)");

  if (leagues.length > 0) {
    // Store locally — fbl-sync.js will pick these up on next FBL page visit
    // even if fblUserId wasn't set yet when this ran
    chrome.storage.local.set({ espnDiscovered: leagues });
    chrome.runtime.sendMessage({ type: "ESPN_USER_LEAGUES", leagues });
  }
}

// ── Relay data for current league in URL ──────────────────────────────────────

async function syncLeague() {
  const leagueId = getLeagueIdFromUrl();
  if (!leagueId) return;

  // Use seasonId from URL if present (ESPN may use a year ahead of our computed season)
  const urlSeason = new URL(location.href).searchParams.get("seasonId");
  const season    = urlSeason ? Number(urlSeason) : currentNflSeason();

  const views  = ["mTeam", "mMatchup", "mMatchupScore", "mRoster", "mSettings", "mStandings"];
  const params = new URLSearchParams();
  views.forEach((v) => params.append("view", v));
  const url = `${ESPN_API}/${season}/segments/0/leagues/${leagueId}?${params}`;

  try {
    const resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) {
      console.log("[FBL] ESPN fetch failed:", resp.status);
      return;
    }
    const data = await resp.json();
    chrome.runtime.sendMessage({ type: "ESPN_RELAY", leagueId, season, data });
    console.log("[FBL] ESPN data synced for league", leagueId, "season", season);
  } catch (e) {
    console.error("[FBL] ESPN sync error:", e);
  }
}

discoverUserLeagues();
syncLeague();
