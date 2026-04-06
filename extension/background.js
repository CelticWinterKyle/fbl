// FBL Background Service Worker
// Receives ESPN league data from the content script and relays it to FBL's server.

const FBL_RELAY = "https://familybizfootball.com/api/espn/relay";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "ESPN_RELAY") {
    relayToFBL(msg).catch((e) => console.error("[FBL] Relay error:", e));
  }
});

async function relayToFBL({ leagueId, season, data }) {
  // Read the user's FBL session cookie — proves this browser is logged in to FBL
  const cookies = await chrome.cookies.getAll({ domain: "familybizfootball.com" });
  const fblUid  = cookies.find((c) => c.name === "fbl_uid")?.value ?? null;

  if (!fblUid) {
    console.log("[FBL] No fbl_uid — user hasn't connected to FBL yet, skipping relay");
    return;
  }

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
    console.log("[FBL] Relay failed:", resp.status);
  }
}
