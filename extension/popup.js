const APP_URL = "https://familybizfootball.com";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pull leagueId out of an ESPN Fantasy URL if present. */
function extractLeagueId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname.includes("espn.com")) return null;
    return u.searchParams.get("leagueId") ?? null;
  } catch {
    return null;
  }
}

/** Read ESPN auth cookies — supports both legacy (espn_s2/SWID) and new (ESPN-ONESITE) auth. */
async function getEspnCookies() {
  try {
    const all = await chrome.cookies.getAll({ domain: "espn.com" });
    const espnS2    = all.find((c) => c.name === "espn_s2")?.value ?? null;
    const swid      = all.find((c) => c.name === "SWID")?.value ?? null;
    const espnToken = all.find((c) => c.name === "ESPN-ONESITE.WEB-PROD.token")?.value ?? null;
    return { espnS2, swid, espnToken };
  } catch (e) {
    console.error("[FBL] Cookie error:", e);
    return { espnS2: null, swid: null, espnToken: null };
  }
}

/** Open a URL in a new tab and close the popup. */
function openTab(url) {
  chrome.tabs.create({ url });
  window.close();
}

/** Set hint text with an optional trailing link — avoids innerHTML. */
function setHint(hintEl, text, linkText, linkUrl) {
  hintEl.textContent = "";
  hintEl.appendChild(document.createTextNode(text));
  if (linkText && linkUrl) {
    hintEl.appendChild(document.createTextNode(" "));
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = linkText;
    a.addEventListener("click", (e) => { e.preventDefault(); openTab(linkUrl); });
    hintEl.appendChild(a);
  }
  hintEl.classList.remove("hidden");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function init() {
  const [{ espnS2, swid }, tabs] = await Promise.all([
    getEspnCookies(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);

  const activeTab = tabs[0] ?? null;
  const leagueId  = extractLeagueId(activeTab?.url);
  const loggedIn  = !!(espnS2 && swid) || !!espnToken;

  // ── DOM refs ──
  const espnDot     = document.getElementById("espn-dot");
  const espnStatus  = document.getElementById("espn-status");
  const leagueBadge = document.getElementById("league-badge");
  const leagueIdText = document.getElementById("league-id-text");
  const hint        = document.getElementById("hint");
  const connectBtn  = document.getElementById("connect-btn");
  const dashBtn     = document.getElementById("dashboard-btn");
  const footerLink  = document.getElementById("footer-link");

  // ── Always-on shortcuts ──
  dashBtn.addEventListener("click", () => openTab(`${APP_URL}/dashboard`));
  footerLink.addEventListener("click", (e) => { e.preventDefault(); openTab(APP_URL); });

  // ── ESPN login status ──
  if (loggedIn) {
    espnDot.className = "dot dot-found";
    espnStatus.textContent = "Signed in to ESPN";
  } else {
    espnDot.className = "dot dot-missing";
    espnStatus.textContent = "Not signed in to ESPN";
    connectBtn.textContent = "Sign in to ESPN First";
    connectBtn.disabled = true;
    setHint(
      hint,
      "Log in to ESPN Fantasy in your browser, then click this extension again.",
      "Open ESPN →",
      "https://www.espn.com/fantasy/football/"
    );
    return;
  }

  // ── League detection ──
  if (leagueId) {
    leagueBadge.classList.remove("hidden");
    leagueIdText.textContent = "#" + leagueId;
    connectBtn.textContent = "Connect This League to FBL \u2192";
    connectBtn.disabled = false;
  } else {
    connectBtn.textContent = "Open FBL Connect \u2192";
    connectBtn.disabled = false;

    const isOnEspn = (activeTab?.url ?? "").includes("espn.com");
    if (isOnEspn) {
      setHint(hint, "Navigate to your ESPN Fantasy league page to auto-detect your league ID.");
    } else {
      setHint(
        hint,
        "Go to your ESPN Fantasy league page first and we'll auto-detect your league.",
        "Open ESPN Fantasy →",
        "https://fantasy.espn.com/football/"
      );
    }
  }

  // ── Connect button ──
  connectBtn.addEventListener("click", () => {
    const url = new URL(`${APP_URL}/connect`);
    if (espnS2) url.searchParams.set("espnS2", espnS2);
    if (swid) url.searchParams.set("swid", swid);
    if (espnToken) url.searchParams.set("espnToken", espnToken);
    if (leagueId) url.searchParams.set("leagueId", leagueId);
    openTab(url.toString());
  });
}

document.addEventListener("DOMContentLoaded", init);
