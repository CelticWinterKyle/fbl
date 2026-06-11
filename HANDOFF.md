# League Blitz — Session Handoff (2026-06-10)

Read this first in any new session. Supersedes the 2026-06-09 handoff (git
history: 5354699 and earlier). CLAUDE.md is the architecture reference; this
is the state-of-the-world.

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
- ESPN strategy: capture session once on desktop (extension/bookmarklet) ->
  server refreshes ONESITE token (reactive + nightly cron) -> phone works
  forever. No email/password ever.
- The repo is /Users/celticwinter/Projects/football/fbl. Mockups in mockups/
  (odds-integration.html = Odds tab reference; monetization-concepts.html =
  League HQ / Store / Partners concepts).
- Tests: `npm test` (vitest, 42). CI gates lint/tsc/test/build (Node 20).
