# Chrome Web Store — Publishing Guide (League Blitz Extension)

Everything you need to submit the extension. Most fields below are copy-paste ready.

## 0. One-time setup (the only blocker)
1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and pay the **one-time $5** registration fee.
2. Set the privacy-policy URL on your developer account to **https://leagueblitz.app/privacy**.

## 1. Package the extension
A clean zip is pre-built at `extension/dist/league-blitz-extension-1.6.0.zip`
(no .DS_Store, no .md files). Or rebuild it:
```
cd extension
zip -r dist/league-blitz-extension-1.6.0.zip . -x ".DS_Store" -x "*/.DS_Store" -x "*.md" -x "dist/*"
```
Upload it in the dashboard ("Upload new package").

## 2. Store listing fields

**Name:** League Blitz

**Summary (132 char max):**
> Connect your ESPN Fantasy league to League Blitz in one click and keep your league data synced automatically.

**Category:** Sports

**Description:**
> League Blitz brings your Yahoo, Sleeper, and ESPN fantasy leagues into one dashboard, with live scores, matchups, rosters, power rankings, and AI matchup analysis.
>
> This extension exists for one thing: connecting your **private ESPN leagues**. ESPN doesn't offer a public login for third-party apps, so for private leagues this extension reads your ESPN session from your own browser and securely syncs your league data to your League Blitz account. No copying cookies by hand, and no ESPN password is ever asked for or seen.
>
> - One-click connect for private ESPN leagues
> - Auto-detects the leagues you're in
> - Keeps your league data refreshed
> - Your credentials are encrypted and used only to fetch your own leagues
>
> Public ESPN leagues and Yahoo/Sleeper leagues don't need this extension. You can connect those directly at leagueblitz.app.
>
> Not affiliated with ESPN, Yahoo, or Sleeper.

**Single purpose (required field):**
> Sync the user's own ESPN fantasy football league data to their League Blitz account.

## 3. Permission justifications (required — reviewers read these)

- **cookies** — "Reads the user's ESPN session cookies, in their own browser, to authenticate requests for their own private-league data. Cookies are never read from any site other than espn.com."
- **host permission `https://*.espn.com/*`** — "Fetches the signed-in user's own fantasy league data from ESPN's endpoints."
- **host permission `https://leagueblitz.app/*`** — "Sends the user's league data to their own League Blitz account and reads their account ID."
- **storage** — "Stores the user's connected league IDs and a short-lived sync token locally."
- **alarms** — "Periodically refreshes the user's league data in the background."
- **activeTab** — "Detects the league ID on the ESPN tab the user is viewing when they click the extension."

## 4. Privacy practices (data disclosure form)

- Does it collect user data? **Yes.**
- Data types: **Authentication information** (ESPN session cookies/tokens) and **Web history limited to the user's own fantasy league pages** — used only to sync the user's leagues.
- Certify all of:
  - Not sold to third parties
  - Used only for the single purpose above
  - Not used for creditworthiness / lending
- Privacy policy URL: **https://leagueblitz.app/privacy**

## 5. Assets you need to create (images)
- **Icon:** included (LB mark, 128x128 in `icons/`). Done.
- **At least 1 screenshot:** 1280x800 or 640x400 PNG. Suggested shots:
  1. /connect on leagueblitz.app showing the ESPN card with "extension active" + a detected league.
  2. The extension popup open on an ESPN league page showing "Connect This League to League Blitz".
  3. The dashboard with an ESPN league loaded.
  (2-5 screenshots is ideal.)
- **Small promo tile (optional but recommended):** 440x280 PNG.

## 6. After it's approved
1. Copy the published extension's URL (`https://chromewebstore.google.com/detail/<id>`).
2. Set it in `components/connect/EspnConnectCard.tsx` -> `ESPN_EXTENSION_STORE_URL`. The "Get the extension" button then appears automatically in the connect card.

## Notes
- Review typically takes 1-3 business days; first submissions can take longer.
- The `cookies` permission + ESPN host access will get extra scrutiny — the justifications above are written to address exactly that. Keep them accurate.
- Version is `1.6.0` in `manifest.json`; bump it for every resubmission.
- v1.6.0 dropped the legacy familybizfootball.com host permissions (canonical
  domain only) — fewer host permissions means less review friction.
