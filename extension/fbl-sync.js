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

    // Get the connected ESPN league config
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
