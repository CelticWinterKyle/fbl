// FBL Sync — content script on familybizfootball.com
// Gets the Clerk userId from the FBL API, stores it for the background service
// worker, then tells the background to sync ESPN data.

async function notifyBackground() {
  try {
    // Get the Clerk userId from FBL (user must be signed in)
    const idResp = await fetch("/api/user/id", { cache: "no-store" });
    if (!idResp.ok) return; // not signed in
    const { userId } = await idResp.json();
    if (!userId) return;

    // Store userId so background service worker can include it in relay requests
    await chrome.storage.local.set({ fblUserId: userId });

    // If espn-sync.js discovered leagues before fblUserId was set, report them now
    const { espnDiscovered } = await chrome.storage.local.get("espnDiscovered");
    if (espnDiscovered && espnDiscovered.length > 0) {
      fetch("/api/espn/discovered-leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-fbl-uid": userId },
        body: JSON.stringify({ leagues: espnDiscovered }),
      }).catch(() => {});
    }

    // Get all connected ESPN leagues
    const resp = await fetch("/api/user/connections", { cache: "no-store" });
    if (!resp.ok) return;
    const { connections } = await resp.json();
    const espnLeagues = connections?.espn?.leagues ?? [];
    if (espnLeagues.length === 0) return;

    chrome.runtime.sendMessage({
      type: "FBL_ESPN_CONFIG_ALL",
      leagues: espnLeagues.map((l) => ({ leagueId: String(l.leagueId), season: l.season ?? null })),
    });
  } catch {
    // Extension not active or API unavailable — silently skip
  }
}

notifyBackground();
