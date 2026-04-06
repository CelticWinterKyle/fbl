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
  const season = currentNflSeason();
  try {
    // ESPN's user endpoint returns all leagues the authenticated user is in
    const resp = await fetch(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}?view=mUserNFL`,
      { credentials: "include" }
    );
    if (!resp.ok) {
      console.log("[FBL] mUserNFL fetch failed:", resp.status);
      return;
    }
    const data = await resp.json();
    console.log("[FBL] mUserNFL top-level keys:", Object.keys(data));

    // Response shape: data.user.preferences (each has type "LEAGUE_JOINED" and entityId = leagueId)
    const prefs = data?.user?.preferences ?? [];
    console.log("[FBL] Preferences count:", prefs.length, "| sample:", JSON.stringify(prefs[0] ?? null));

    const leagues = prefs
      .filter((p) => p.type === "LEAGUE_JOINED" && p.entityId)
      .map((p) => ({ leagueId: String(p.entityId), season }));

    console.log("[FBL] Discovered leagues:", leagues.map((l) => l.leagueId).join(", ") || "(none)");

    if (leagues.length > 0) {
      // Store locally — fbl-sync.js will pick these up on next FBL page visit
      // even if fblUserId wasn't set yet when this ran
      chrome.storage.local.set({ espnDiscovered: leagues });
      chrome.runtime.sendMessage({ type: "ESPN_USER_LEAGUES", leagues });
    }
  } catch (e) {
    console.error("[FBL] League discovery error:", e);
  }
}

// ── Relay data for current league in URL ──────────────────────────────────────

async function syncLeague() {
  const leagueId = getLeagueIdFromUrl();
  if (!leagueId) return;

  const season = currentNflSeason();
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
    console.log("[FBL] ESPN data synced for league", leagueId);
  } catch (e) {
    console.error("[FBL] ESPN sync error:", e);
  }
}

discoverUserLeagues();
syncLeague();
