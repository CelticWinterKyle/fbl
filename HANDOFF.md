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
| Chrome Web Store: WAIT for review result | Dev console (kyle@celticwinter.com, item fpleoilifjbilblfggehdnlckglplnom) | SUBMITTED 2026-06-10 (v1.6.0, LB logo icons, 3 screenshots, all privacy fields). On approval: paste store URL into EspnConnectCard.tsx ESPN_EXTENSION_STORE_URL. On rejection: fix, bump to 1.6.1, resubmit. |
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

## 5b. Audit findings deferred (4-agent audit, 2026-06-10 night)

Fixed same-night: push cursor ordering + tag collisions, ESPN connect-flow
brand leftovers, Yahoo UA strings, props name trimming, odds:lastopen TTL,
narrative input bounds. Verified false alarm: .env.local is NOT tracked in
git (agent misread); no rotation needed. Still open, in priority order:

1. **ESPN season-rollover staleness (the one real pre-season code item).**
   Stored conn.season is set at connect time; when currentNflSeason() flips
   to 2026 in Sept, fetches keep using the stale season. Fix: on empty/failed
   fetch, retry with currentNflSeason() and persist on success (self-heal in
   getEspnData / lib/adapters/espn.ts). Do BEFORE September; test in August.
2. Cron heartbeat: write cron:lastrun:{name} (ts + summary) from each cron,
   surface staleness in /api/health. Cheap, makes silent cron death visible.
3. Capacity caps to revisit when users grow: push-dispatch 150 users/run,
   refresh-leagues 100 leagues/run. Fine today; revisit at ~100+ users.
4. ALERT_WEBHOOK_URL still unset (platform-outage alerts go to console only)
   and no Sentry; acceptable while user base is tiny.
5. UX polish, low: onboarding lets you skip through with zero platforms;
   ESPN step in onboarding lacks the needs-desktop note; OffseasonPanel copy
   says "last season" year-round; privacy/terms "last updated" dates are
   hardcoded; OffseasonPanel invite copies bare origin.

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
