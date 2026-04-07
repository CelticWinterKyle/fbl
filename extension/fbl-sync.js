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

    // Fetch a short-lived HMAC-signed relay token (valid 24h)
    // This replaces the raw userId header for authenticating extension relay requests.
    let relayToken = null;
    try {
      const tokenResp = await fetch("/api/espn/relay-token", { cache: "no-store" });
      if (tokenResp.ok) {
        const tokenData = await tokenResp.json();
        if (tokenData.ok) {
          relayToken = tokenData.token;
          await chrome.storage.local.set({ relayAuth: { token: relayToken, expiresAt: tokenData.expiresAt } });
        }
      }
    } catch {}

    // If espn-sync.js discovered leagues before relayToken was available, report them now
    const { espnDiscovered } = await chrome.storage.local.get("espnDiscovered");
    if (espnDiscovered && espnDiscovered.length > 0 && relayToken) {
      fetch("/api/espn/discovered-leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-fbl-relay-token": relayToken },
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
