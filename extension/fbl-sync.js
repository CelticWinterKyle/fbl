// FBL content script — runs on familybizfootball.com
// Reads the user's ESPN connection from the FBL API and tells the background
// worker to sync, so the user never has to manually visit ESPN.

async function notifyBackground() {
  try {
    const resp = await fetch("/api/user/connections", { cache: "no-store" });
    if (!resp.ok) return;
    const { connections } = await resp.json();
    const espn = connections?.espn;
    if (!espn?.connected || !espn?.leagueId) return;

    chrome.runtime.sendMessage({
      type: "FBL_ESPN_CONFIG",
      leagueId: String(espn.leagueId),
      season: espn.season ?? null,
    });
  } catch {
    // Extension not active or API unavailable — silently skip
  }
}

notifyBackground();
