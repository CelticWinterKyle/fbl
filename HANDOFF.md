# League Blitz — Session Handoff (2026-06-10)

Read this first in any new session. Supersedes the 2026-06-09 handoff (git
history: 5354699 and earlier). CLAUDE.md is the architecture reference; this
is the state-of-the-world.

---

## POSTSCRIPT 2026-08-18: Yahoo is BACK. Read this before the 08-17 section below.

**Yahoo restored API access on 2026-08-17.** Verified twice: the admin probe
returned scope OK with both league keys readable, and the live dashboard now
renders M.U.K and Family Business at WEEK 1 / 2026 with real team names and
0.0 scores (correct, both leagues are predraft, season opens 2026-09-09). The
June shape-parsing disaster did NOT recur. No reconnect was needed. The
diagnostic route has been deleted.

Everything in the 08-17 postscript below is history now. Its bug list is
resolved except where noted.

### The agreement was read, and it does not say what we thought

`docs/YAHOO_COMPLIANCE.md` is the authority. Three corrections:

1. **Caching is prohibited outright** (2.c.vii), not capped at 30 days. That
   sits in tension with 2.c.v, which requires designing around Yahoo's rate
   limits, so short operational caches are arguable. Indefinite storage was
   not, and is gone.
2. **The 30 days is about AI** (3.e): every input to an AI tool and every
   output belongs exclusively to Yahoo, cannot train or ground a model, and
   must be deleted at least every 30 days. `startsit:log` was keeping exactly
   that for a full season. Fixed.
3. **Gambling is banned** (2.c.iii): Yahoo Materials may not support any
   application involving gambling, Yahoo's sole discretion, immediate
   termination. **DECIDED 2026-08-18: Phase B sportsbook affiliate is ON
   HOLD.** Neither book ever replied anyway. Phase A stays live.

**DECIDED 2026-08-18:** retain Yahoo data for the season, on section 13's
reasonableness standard. Implemented as `YAHOO_RETENTION_S` (270 days,
`lib/retention.ts`) on the league keys, myteam, and registry pruning. Tokens
and the Sleeper/ESPN stores are deliberately untouched.

### Shipped 2026-08-17/18

- Off-season Game Day stops presenting last season's finals as live, and the
  Scores page marks finished leagues Final per league. Unplayed matchups no
  longer claim to be close games.
- `isNflGameWindow()` is gated on the season (bug 3 below). This was the real
  caching win: no more off-season Sunday traffic to dead APIs.
- Yahoo errors distinguish app-blocked from expired-token from everything
  else, and never tell a user to reconnect when reconnecting cannot work.
- Attribution shipped (`components/DataAttribution.tsx`), verified against the
  cover page. **Do NOT add Yahoo's logo:** section 16 forbids using their marks
  without written consent in each instance.
- **Link previews existed nowhere.** The site had a description tag and no
  og:image, og:title, or twitter card, so texting the link rendered a bare URL.
  Added `/api/og/site` (1200x630, edge) plus metadata. Card line: "Every league
  you're in, on one screen."
- Coach's record now uses durable counters (`startsit:record:{season}`) holding
  no Yahoo information, so the season record survives the 30-day deletion.

### Still open

- ~~ESPN re-capture~~ **SOLVED 2026-08-18, verified healthy=4.** The outage was
  never a capture problem: lm-api-reads wants espn_s2+SWID cookies ALONE, and a
  Bearer token sent beside good cookies causes the 401. Full rules in the
  espn-strategy memory and the 08-18 commit messages (espnCookieHeader,
  espnVerify, bookmarklet raw-s2, extension 1.7.0 content-script capture).
  Extension 1.7.0 submitted to the Chrome store 2026-08-18 with the Yahoo
  attribution line; when it clears review, credential renewal is automatic.
- Paste the Yahoo attribution line into the live Chrome Web Store listing
  (copy is in `extension/STORE_LISTING.md`).
- The start/sit scorer cron. Must call `bumpCoachResult()`, never rebuild the
  record by replaying verdicts.
- Termination runbook (agreement section 6): one sweep deleting every Yahoo key.
- Bugs 1, 2 and 6 from the 08-17 list below are still open. Bug 1 matters most
  now that real Yahoo traffic has resumed: a total outage still reads as 4
  errors per 1 success, so partial failures cannot page.
- `ODDS_API_KEY` still unset. Lower-risk compliance items (Pickups vs 2.c.x,
  /share vs section 5, Trophy Case vs section 13, Territory) are listed in
  `docs/YAHOO_COMPLIANCE.md`.
- Nobody has walked new-user onboarding end to end with 2026 data.

---

## POSTSCRIPT 2026-08-17: YAHOO IS DEAD PLATFORM-SIDE. Access application approved, awaiting provisioning.

**Read this before touching anything Yahoo. Yahoo is not broken in our code and
there is nothing to fix here.** Do not "fix" the Yahoo integration, do not
reconnect, do not rewrite the adapter, do not delete the Yahoo developer app.

### What happened

At **2026-07-27T22:23:11Z** every Yahoo league call started failing and has
failed ever since. Yahoo closed self-serve access to the Fantasy Sports API and
moved it behind an application-and-approval process at
https://sports.yahoo.com/developer/. The new portal appeared ~early May 2026 and
rolled out gradually; our app was cut off on 07-27. Other developers report the
same thing (r/fantasyfootballcoding, "PSA: Yahoo Fantasy Football Devs").

Yahoo answers **HTTP 403 "This application is not authorized to perform this
action."** to every Fantasy resource. Confirmed app-level, not league-level:
`users;use_login=1/games;game_codes=nfl/leagues`, which names no league key, is
refused identically.

### What is NOT the cause (all of these were checked and cleared)

- **Not OAuth.** Authorization and token refresh both succeed. A completely
  fresh grant on 07-28 was refused six seconds after being issued.
- **Not the stored league keys.** `470.l.936665` / `470.l.950460` are current.
- **Not lib/seasonRollover.ts.** It was the prime suspect and is innocent.
- **Not the account-recovery interstitial** Yahoo sometimes interposes.
- **Not the app's permission checkbox.** developer.yahoo.com still shows
  "Fantasy Sports - Read" CHECKED on app yQfprMqk, but the input is
  `disabled:true` and Update is disabled, so it cannot be re-saved. The console
  form does not reflect what Yahoo's API layer enforces. **Do not trust that
  checkbox as evidence of anything.**

### Where it stands

| Date | Event |
|---|---|
| 2026-07-28 | Applied at sports.yahoo.com/developer/access/ (App ID yQfprMqk, read-only, Small <1,000 users) |
| 2026-08-10 | **Approved.** API Access and Use Agreement executed via DocuSign |
| 2026-08-12 | Yahoo asked for Client ID + App ID + Yahoo email (from fantasyapideveloper@yahoosports.com, note: different mailbox from the approval sender) |
| 2026-08-13 | Replied with all three |
| 2026-08-17 | No response yet. Access still refused. |

Yahoo account owning the dev app: **kyle@celticwinter.com**. App ID **yQfprMqk**.
If Yahoo goes quiet past ~a week, nudge the existing mail thread.

### How to check whether access came back

Load **`/api/admin/yahoo-diagnose`** while signed in as admin. It says
`SCOPE OK` or `SCOPE REFUSED` in the verdict field. When it flips to SCOPE OK the
Yahoo leagues return on their own; **no reconnect is needed**, the tokens were
never the problem. That route is `app/api/admin/yahoo-diagnose/route.ts`
(commit 435785c), admin-gated, returns no secrets. **Delete it once Yahoo works.**

### Obligations we have now signed up for

The executed agreement is binding on Celtic Winter Dev. One approved developer
reports it carries **specific limits on storing/caching Yahoo data, with cached
data to be deleted within 30 days**, and the portal requires **attribution**
("Fantasy data provided by Yahoo Fantasy", their logo, link back, strict usage
rules). Before Yahoo goes live again, audit against the executed PDF:
`lib/cache.ts` snapshots, the KV league registry, My Team, recap/leagueHistory
persistence. Short TTLs (15 min, 60s in-window) are likely fine; durable stores
are the risk. Attribution is real UI work that does not exist yet.

Also note the application described League Blitz as it exists today: free, no
affiliate, read-only. If Phase B of docs/ODDS_MONETIZATION_PLAN.md ever ships,
that description stops being accurate and Yahoo should be told.

### Shipped this session

- `ec9f0b1` **Yahoo errors log what Yahoo actually said.** The yahoo-fantasy SDK
  rejects with Yahoo's raw `{description, detail}` payload, not an Error, so
  `e?.message` was undefined and every failure logged the literal string
  "undefined" for weeks. New `yahooErrMessage()` in `lib/adapters/yahoo.ts`,
  also applied to the seasonRollover probe warning. This is the only reason the
  root cause was findable.
- `435785c` the temporary diagnostic route described above.

### Known bugs found while investigating, NOT yet fixed

1. **`recordPlatformSuccess("yahoo")` fires unconditionally** at the end of
   `fetchLeagueData` (`lib/adapters/yahoo.ts`) even when all four calls failed.
   A total outage therefore reads as exactly 4 errors per 1 "success". Worse,
   the alert rule is `err >= 10 AND err > ok`, so a *partial* Yahoo failure can
   never page: one failing endpoint records 1 err and 1 ok.
2. **`readPlatformStats(1)` reads only the current partial UTC hour**, so the
   alert's "over the last hour" is wrong; firing at :00 reports on seconds.
3. **`isNflGameWindow()` has no season gate** (`lib/gameWindow.ts`). It returns
   true every Sun/Mon/Thu/Sat year round, so refresh-leagues wakes up in July
   and hammers dead APIs. This is why the Yahoo alerts kept re-firing.
4. **Game Day shows stale Week 17 / "4-0 across 4 leagues"** from last season,
   served from the ESPN relay snapshot. A new user before September sees final
   scores presented as live.
5. **The Yahoo error tells users to reconnect** ("Try reconnecting Yahoo on the
   Leagues page", `lib/leagueData.ts`). Reconnecting cannot work and never
   could. Should say access is pending.
6. **`migrateYahooForUser` persists a renewed league key without validating it
   is fetchable**, and unregisters the old one, so a bad pointer is unrecoverable.
   Not the cause of this outage, but real fragility.

Items 4 and 5 are what a new user actually sees. Kickoff is early September.

### ESPN, unrelated and still outstanding

`espn-keepalive` reads `healthy=0 unhealthy=4` and has for months; the ONESITE
credential chain aged out over the off-season. Still needs a desktop re-capture
before Week 1 (see the 07-19 postscript below). ESPN league fetches also 400
because `currentNflSeason()` holds at 2025 until September.

---

## POSTSCRIPT 2026-07-19: KV stale-read ROOT CAUSE found + fixed; ESPN alert mute reworked

The "KV reads look stale" / false dead-cron pages that recurred for weeks
(06-11, 07-09/10, and daily 07-16..07-19) had a concrete root cause, found by
reading the deprecated wrapper's source: **`@vercel/kv` v3 hard-codes
`cache: "default"` on every REST request** (`@vercel/kv/dist/index.js`:
"upstash/redis defaults to `no-store`, so we enforce `default`"). Under the
Next.js App Router that opts every `kv.get()` into Next's fetch Data Cache, so
a read can serve a force-cached HTTP response frozen for the life of a
serverless instance. Different instances hold different frozen snapshots →
the exact flapping + linearly-growing heartbeat ages we kept seeing. The
07-15 store migration and 07-16 watchdog hardening never touched this because
it is not a store defect — it is the read path, precisely as theorized.

Fixes shipped this session (all on `main`; verified 98/98 vitest, lint + tsc +
build clean):

1. **KV client swap `@vercel/kv` → `@upstash/redis` direct** (new `lib/kv.ts`,
   all 22 call sites now `await import("@/lib/kv")`). Configured
   `cache: "no-store"` + `readYourWrites: true`, from the same KV_REST_API_*
   env vars (no env change needed). Serialization is identical (both default
   to automatic JSON de/serialization) so existing keys read back unchanged.
   `@vercel/kv` removed from package.json. This removes the caching mechanism
   that froze reads — the durable root-cause fix.
2. **Watchdog hardened against residual flapping** (`app/api/cron/alerts`):
   before paging ANY sibling cron dead, it now re-reads that specific
   heartbeat key 2× ~4s apart (the probe previously applied only to the
   self-beat) and only pages if every sample still reads stale. A flap
   recovers and stays silent; a genuinely dead cron stays stale. This closes
   the hole where a fresh self-beat + stale sibling reads false-paged three
   crons on 07-19.
3. **ESPN alert mute reworked** (`app/api/cron/alerts`): the old
   `ESPN_ALERTS_MUTED_UNTIL = 2026-07-15` constant lapsed mid-off-season and
   re-spammed the channel hourly. Replaced with a recurring calendar gate
   `isEspnAlertsMuted()` — muted Feb–Jul, active Aug–Jan. Never lapses; when
   it flips active in August a still-dead ESPN connection pages once/hour as
   the actionable "re-capture before Week 1" reminder.

STILL MANUAL (Kyle):
- **Re-capture ESPN on desktop before the season.** On 07-19 keepalive read
  `healthy=0 unhealthy=4` — all 4 of Kyle's ESPN leagues fail because the
  ONESITE credential chain aged out over the off-season (Disney refresh-auth
  no longer mints fresh creds from the stored refresh_token, so validation
  falls back to the long-expired embedded access token → 401). This is a
  credential expiry, NOT a code bug; the "capture once → phone forever" chain
  has a finite horizon = the ONESITE refresh-token lifetime. The exact error
  is visible at /admin → Kyle's user → ESPN connection (`readEspnHealth`).
- **Deploy this session's changes** (not yet deployed as of writing — they
  only take effect in prod after a push/redeploy).
- **Delete the old `byzantium-helmet` KV store** from Vercel Storage (still
  only disconnected from the 07-15 migration).

---

## 1. Security debt: ZERO known items as of 2026-06-10

Everything from the security review and the 06-09 checklist is closed:

- **Clerk production instance: LIVE.** leagueblitz.app runs on the prod
  instance (clerk.leagueblitz.app, pk_live/sk_live in Vercel prod env). The
  five Clerk CNAMEs are in Vercel DNS. user.deleted webhook configured
  (endpoint /api/webhooks/clerk, CLERK_WEBHOOK_SIGNING_SECRET set). Google
  SSO runs on real OAuth credentials (Google Cloud project "League Blitz",
  league-blitz-499019, consent screen published). Kyle is signed up fresh on
  prod (Google sign-in verified) and reconnected Yahoo/Sleeper/ESPN.
- **SESSION_SECRET rotated** (06-10). Old ESPN cookie encryptions and relay
  tokens died with it; Kyle re-synced. Note: prod sk_live key and the webhook
  signing secret passed through a chat session on 06-10; rotate both in the
  Clerk dashboard if ever concerned.
- **Leaked Yahoo refresh token revoked** (Yahoo account -> External
  connections -> removed "Famiz Biz Final"), then reconnected fresh from
  leagueblitz.app.

## 2. Remaining manual checklist (none security-critical)

| Item | Where | Notes |
|---|---|---|
| Remove DEBUG_ROUTES from prod env | Vercel env | Routes correctly 404 in prod today, but the var has no business existing in Production. |
| GA / GTM for leagueblitz.app | Google consoles | Search Console DONE 2026-06-10 (HTML meta verification in app/layout.tsx). Analytics still optional/pending. |
| ~~Chrome Web Store~~ | PUBLISHED 2026-06-11 (v1.6.0, public): chromewebstore.google.com/detail/league-blitz/fpleoilifjbilblfggehdnlckglplnom | Store URL wired into EspnConnectCard (the Get-the-extension button now renders). Future extension updates: bump manifest version, rebuild zip, upload in dev console. |
| ODDS_API_KEY | Vercel env | Activates the player-props section (sec. 4). Free tier for dev; ~$59/mo tier for live-season volume. Provision in August. |
| Neon/Supabase Postgres (optional until League HQ) | Vercel Marketplace | Then `psql "$POSTGRES_URL" -f db/schema.sql`; lib/db.ts activates on POSTGRES_URL. |
| ALERT_WEBHOOK_URL (optional) | Vercel env | Discord webhook for hourly platform-outage alerts. |

## 3. What shipped 2026-06-10 (all on `main`, deployed + verified)

| Commit | What |
|---|---|
| (env only) | Clerk prod keys + webhook secret + SESSION_SECRET rotation in Vercel prod; dev-instance keys restored to Development scope |
| 16edf63 | Rebrand sweep: 8 leftover "FB" monograms -> "LB" (welcome, landing x2, sign-in, sign-up, dashboard + 2 gameday watermarks); extension popup "Family Biz Football" -> "League Blitz", footer -> leagueblitz.app, manifest short_name, v1.5.1 |
| (next) | Support email -> leagueblitz@celticwinter.com on /support, /privacy, /terms (alias must receive mail) |
| (next) | **Odds tab player props** (see sec. 4) |

Verified post-deploy: site serves Clerk from clerk.leagueblitz.app, health
green, auth gates intact (404 to bots / 307-to-sign-in for browsers on
protected routes), 42/42 vitest, lint + tsc + build clean.

## 4. Odds tab: Phase A+ (props pulled forward, affiliate still gated)

docs/ODDS_MONETIZATION_PLAN.md is the source of truth; bright lines
unchanged and inviolable. New since 06-09 (decision documented in the plan):

- **"Your players this week" player props** built content-only: lib/playerName.ts
  (shared name matching), lib/odds.ts props fetchers (The Odds API per-event
  markets player_anytime_td/pass_yds/rush_yds/reception_yds, capped 16 events,
  global KV cache odds:nfl:props, TTL 30 min / 15 in windows), POST
  /api/odds/props (filters global payload to caller's roster names),
  OddsContent prop cards with cross-league "yours in N" tags.
- **NO link-outs, no Sponsored tag, no commission copy** — that dressing is
  Phase B (gate: ~2-5k weekly actives + one book partner + state licensing).
- Dormant until ODDS_API_KEY is set (ESPN scoreboard has no props). Off-season
  the section hides itself; the tab looks exactly as before.
- Reference mockup: mockups/odds-integration.html (now matched except the
  Phase B elements and the feed teaser, which stays deferred).

## 5. Season plan (week 1 ~Sept 10; agreed 2026-06-10)

| When | What |
|---|---|
| June | Redirect + Search Console/GA + Chrome Store submission + Preview env fix |
| Late June-July | Web Push BUILT 2026-06-10 (docs/PUSH_NOTIFICATIONS.md has the implementation map; subscribe + test verified on Kyle's devices? confirm). Remaining: draft-prep content; community presence as leagues form (July-Aug is the growth window) |
| Aug 6+ (preseason) | LIVE verification: ESPN scoreboard odds render, Live Feed plays, player props with real ODDS_API_KEY, push TD alerts on real games; confirm 4 crons run in Vercel dashboard (push-dispatch is */5) |
| Sept | Season live; watch weekly actives; if trending toward 2-5k, start Phase B paperwork (gaming attorney + one book partner) — calendar time is weeks-to-months |

Monetization reality: season one earns ~nothing by design; its job is users +
odds-engagement measurement (already live: odds:opens:{date},
odds:lastopen:{userId}). League HQ (docs/LEAGUE_HQ_DESIGN.md) stays the
diversification track.

DECISION 2026-06-10: the mockups/monetization-concepts.html ideas (League HQ
dues, League Store, Game Day Partners) were reviewed and PASSED ON for now.
Revisit triggers: League HQ track-don't-touch v1 if commissioner retention
becomes the priority; Game Day Partners near week 1 as Phase B affiliate
plumbing practice; League Store in November for season-end merch.

## 5a. Season features plan (late 2026-06-10 session)

docs/SEASON_FEATURES_PLAN.md tracks the 7 agreed features. SIX OF SEVEN
BUILT (2026-06-10/11): lineup alerts (push, default ON), /demo (public,
animated live simulation), weekly recap (push + /recap + /share/week OG
card; per-league finals now opt-in), Trophy Case (real history on
/rankings, verified on Kyle's leagues), AI trade analyzer (My Team league
cards; situational analysis grounded in both rosters, standings/stakes,
4-week form, injuries, starting slots, and NFL bye weeks via
lib/nflSchedule.ts; verdict share cards at /share/trade), and cross-league
waiver intel (Pickups panel on My Team: Sleeper trending + Yahoo/Sleeper
availability; ESPN availability deferred). Also: Game Day week navigator
(browse any week; Yahoo week param bug fixed) + idle-league cards.
#5 draft content ALSO BUILT (2026-06-11): /draft hub + snake/auction
strategy guides + printable cheat sheet (deliberately no player rankings),
sitemap.xml + robots.txt (public in middleware), Draft Kit footer link.
ALL SEVEN FEATURES COMPLETE. Kyle's follow-ups: read/edit the guide copy,
submit the sitemap in Search Console (one click, property already
verified).

CRITICAL FIX FOUND VIA TROPHY CASE DEBUGGING: the Yahoo SDK's shapes were
mis-parsed app-wide. standings is the team ARRAY (not standings.teams) so
all Yahoo records/rankings rendered blank, and matchup scores nest as
points.total objects so Game Day showed 0.0. Both fixed in
lib/adapters/yahoo.ts; unified yahoo cache bumped to v2; would have been a
week-1 disaster. Debug surfaces kept (authed, own leagues only):
/api/league-history?debug=1 (history walk diag), debug=2 (raw scoreboard).

## 5a-bis. AI Coach plan (2026-06-12)

docs/AI_COACH_PLAN.md: three AI additions in build order — per-league AI
weekly recap narrative (globally cached, one call per league per week),
Start/Sit advisor on My Team (v1 head-to-head picker), Coach's Waiver
Report above Pickups (per-user daily cache + Tuesday push later). Draft
assistant deliberately excluded (no-rankings decision stands). All ride
existing rate-limit/budget/cache guardrails; no new services or env vars.

**#2 start/sit advisor v1 BUILT 2026-06-12**: POST /api/analyze-startsit
(form/injuries/projections/byes/slots/weather, verdict cached 1h per
player pair, 15/hr limit, est 3000 tokens) + StartSitAdvisor on My Team
league cards (above Trade analyzer). Calibrated leans with coin flip as a
first-class answer. Every unique verdict logged to startsit:log:{season}
(lib/startsitLog.ts) for post-week grading. STILL TO BUILD: the scorer
cron + "Coach's record" UI (target: by week 1) and Vegas prop-line
grounding once ODDS_API_KEY lands in August (plan addendum has details).

**#1 recap narrative BUILT 2026-06-12** (deployed a7c575b):
POST /api/recap/narrative (global cache ai:recap:v1:{platform}:{league}:
{week}, 8d TTL, est 2000 tokens, 10/hr limit), generation gated to Tue/Wed
ET via isRecapNarrativeWindow() in lib/pushDetect.ts + all-matchups-played
check so half weeks never cache; RecapContent renders a Coach's Recap card
(Megaphone icon) when narratives exist. Dormant off-season by design (the
finals gate 409s; UI hides). 65/65 vitest, lint+tsc+build clean. VERIFY
LIVE first Tuesday of preseason/season.

## 5b. Audit findings deferred (4-agent audit, 2026-06-10 night)

Fixed same-night: push cursor ordering + tag collisions, ESPN connect-flow
brand leftovers, Yahoo UA strings, props name trimming, odds:lastopen TTL,
narrative input bounds. Verified false alarm: .env.local is NOT tracked in
git (agent misread); no rotation needed. Still open, in priority order:

1. ~~ESPN season-rollover staleness~~ FIXED same night: espnSeasonsToTry()
   in lib/season.ts; nightly keepalive cron probes behind-the-calendar
   connections at the current season and persists the bump (seasonsBumped in
   cron output); getEspnData prefers the current season with 6h
   negative-cached probes as backup. VERIFY LIVE in August when leagues
   reactivate (watch seasonsBumped > 0 in keepalive logs).
2. ~~Cron heartbeat~~ DONE 2026-06-11: lib/ops.ts, all four crons record
   cron:lastrun:{name}; /api/health reports lastRun/ageMinutes/summary per
   cron; the alerts cron pages on stale heartbeats (dead-cron watchdog).
   reportCriticalError() pages one-shot criticals (cap truncation wired).
   NOTE: the watchdog can't watch itself — point a free external uptime
   monitor (UptimeRobot etc.) at /api/health.
3. ~~Capacity caps~~ raised 2026-06-11 (push 500/run, leagues 300/run) and
   both PAGE when truncation drops work. Shard the crons if those fire.
4. ALERT_WEBHOOK_URL still unset: heartbeat watchdog + platform-outage +
   critical pages all degrade to console.error until Kyle sets a Discord
   webhook. No Sentry (deliberate; metrics/alerts built instead).
5. ~~UX polish batch~~ DONE 2026-06-11: onboarding requires a platform to
   Continue (explicit Skip remains), Off-Season HQ copy + Draft Kit link,
   legal dates bumped to last real content change, My Team empty state uses
   the logo. ESPN waiver availability ALSO DONE (kona FA/WAIVERS set; real
   chips in Pickups). DEBUG_ROUTES re-scoped to Development only (was "1"
   in ALL environments, production included — debug routes were Clerk-gated
   but DEBUG-enabled in prod until 2026-06-11).

## 6. Domain / auth state

- Canonical: https://leagueblitz.app. Nameservers are Vercel's — ALL DNS
  edits in Vercel (now includes 5 Clerk CNAMEs: clerk, accounts, clkmail,
  clk._domainkey, clk2._domainkey).
- familybizfootball.com + www 301-redirect to leagueblitz.app (set 06-10 via
  Vercel API: PATCH /v9/projects/{id}/domains/{domain} with redirect field).
- Clerk: app "Fantasy Football App", PRODUCTION instance. Dev instance still
  exists for local dev (dev keys in Development env + .env.local).
- Yahoo dev app "Famiz Biz Final" (App ID yQfprMqk), redirect URI only
  https://leagueblitz.app/api/yahoo/callback.
- Support email everywhere: leagueblitz@celticwinter.com.

## 7. Env var inventory (Vercel)

Prod (complete): NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (pk_live),
CLERK_SECRET_KEY (sk_live), CLERK_WEBHOOK_SIGNING_SECRET, SESSION_SECRET
(rotated 06-10), YAHOO_CLIENT_ID/SECRET, YAHOO_REDIRECT_URI, KV_*,
CRON_SECRET, PUBLIC_BASE_URL, OPENAI_API_KEY. DEBUG_ROUTES present but
inert — delete it (sec. 2).
Development (complete): dev-instance Clerk keys + dev SESSION_SECRET.
Preview: MISSING the three vars above (sec. 2).
Optional: ODDS_API_KEY (August), POSTGRES_URL, ALERT_WEBHOOK_URL,
OPENAI_DAILY_TOKEN_BUDGET.
Local dev: `npx vercel env pull .env.local --environment=development --yes`.

## 8. Conventions / rules (carry forward, unchanged)

- **No emojis anywhere in the UI, ever.** lucide-react or inline SVG.
- **No em dashes or en dashes in UI copy.** Periods, commas, "to", parens.
- **No 10s polling.** Manual refresh + 45s auto only during NFL game windows.
- **Always `cache: "no-store"`** on client fetches to internal APIs.
- Display name **"League Blitz"** (UI monograms say **LB**); domain
  **leagueblitz.app**; technical identifiers stay **fbl-*** (Vercel project
  fbl-lr92, repo fbl/).
- Debug routes/pages gated by `DEBUG_ROUTES=1`.
- Odds bright lines in docs/ODDS_MONETIZATION_PLAN.md are inviolable without
  a deliberate documented decision (the 06-10 props pull-forward is the
  model: documented in the plan itself).

## 9. Key technical context / gotchas

- Next.js 14 App Router, TypeScript, Tailwind pitch palette + themeable
  --accent vars, Clerk v7, Vercel KV (Upstash PAYG).
- **KV gotcha (history):** prod Upstash DB was once auto-deleted on the free
  tier and silently broke persistence. Now PAYG + prodGuards fails loudly.
- **Clerk protect() gotcha:** unauthenticated curl gets 404 on protected
  routes, browsers get 307 to sign-in. Both are correct; don't chase the 404.
- **KV stuck-key incident (2026-06-11):** the long-lived health:ping key
  froze for ~20 min (SET returned OK, value never changed) while every other
  key behaved, flipping /api/health to unhealthy. App was unaffected. The
  check now uses a unique key per round-trip; if health ever reports kv:error
  again, checks.kvDetail in the response shows the raw set/read values.
- **KV stale-read incident RESOLVED (2026-07-15):** the original store
  (upstash-kv-byzantium-helmet) intermittently served reads from a snapshot
  frozen at 2026-07-09 ~21:00 UTC for six days (hourly "KV reads look stale"
  Discord pages). Fixed by migrating all 69 keys to a new store (fbl-kv-2,
  iad1, PAYG, spot-verified) via the one-shot /api/admin/kv-migrate route
  (deleted after the swap; restore from git history if ever needed again).
  fbl-kv-2 is connected to fbl-lr92 with the default KV_* env names. The old
  store is disconnected but NOT deleted — delete it from Vercel Storage after
  a soak period once the watchdog stays quiet.
  POSTSCRIPT (2026-07-16): hours after the swap, fbl-kv-2 served ONE read of
  a 2.5h-old version (next request fresh; Upstash status clean), so transient
  stale reads are a read-path behavior (@vercel/kv / Vercel fn networking /
  Upstash REST), not a per-store defect — the old store's six-day flapping was
  still abnormal and the migration stands. The watchdog now confirms staleness
  across three reads ~4s apart before paging (commit 4301d42); single-sample
  blips just log "transient stale KV read" in runtime logs. If sustained
  stale-read pages return on fbl-kv-2, consider replacing the deprecated
  @vercel/kv wrapper with @upstash/redis direct before blaming the store.
- ESPN strategy: capture session once on desktop (extension/bookmarklet) ->
  server refreshes ONESITE token (reactive + nightly cron) -> phone works
  forever. No email/password ever.
- The repo is /Users/celticwinter/Projects/football/fbl. Mockups in mockups/
  (odds-integration.html = Odds tab reference; monetization-concepts.html =
  League HQ / Store / Partners concepts).
- Tests: `npm test` (vitest, 42). CI gates lint/tsc/test/build (Node 20).
