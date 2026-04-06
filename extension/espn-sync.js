// FBL ESPN Sync — content script on fantasy.espn.com
// Fetches private league data in the browser (where auth works) and relays it to FBL.

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

async function syncLeague() {
  const leagueId = getLeagueIdFromUrl();
  if (!leagueId) return;

  const season = currentNflSeason();
  const views  = ["mTeam", "mMatchup", "mMatchupScore", "mRoster", "mSettings", "mStandings"];
  const params = new URLSearchParams();
  views.forEach((v) => params.append("view", v));
  const url = `${ESPN_API}/${season}/segments/0/leagues/${leagueId}?${params}`;

  try {
    // fetch WITH credentials — browser automatically sends all ESPN cookies
    // including session cookies that make private leagues work
    const resp = await fetch(url, { credentials: "include" });
    if (!resp.ok) {
      console.log("[FBL] ESPN fetch failed:", resp.status);
      return;
    }
    const data = await resp.json();

    // Relay to FBL via background service worker (which has FBL host_permissions)
    chrome.runtime.sendMessage({
      type: "ESPN_RELAY",
      leagueId,
      season,
      data,
    });

    console.log("[FBL] ESPN data synced for league", leagueId);
  } catch (e) {
    console.error("[FBL] ESPN sync error:", e);
  }
}

// Run after page settles
syncLeague();
