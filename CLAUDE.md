# Family Business League (FBL) — Project Context

## What this is

A multi-platform fantasy football dashboard that aggregates Yahoo, Sleeper, and ESPN leagues into one unified view with AI-powered matchup analysis. Built for personal use — "Family Business League" is the user's family league name but the app supports any leagues.

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** — dark "pitch" theme (custom `pitch-*` palette, `accent-*` tokens driven by CSS vars for per-user NFL-team accents)
- **Upstash Redis** (`@upstash/redis` via `lib/kv.ts`) — persistent token/connection storage in production (was `@vercel/kv`; swapped 2026-07-19 because that wrapper forced `cache: "default"` and let Next's fetch cache freeze KV reads)
- **File-based storage** (`lib/yahoo-users/`) — used automatically in dev when KV is absent
- **Yahoo Fantasy SDK** (`yahoo-fantasy`) — used for scoreboard, meta, standings via OAuth
- **OpenAI** (`gpt-4o-mini`, structured JSON output) — matchup + roster analysis
- **Open-Meteo** — free weather API, no key required
- **Sleeper public REST API** — no auth required
- **ESPN unofficial API** (`lm-api-reads.fantasy.espn.com`) — optional cookies for private leagues

## Architecture

### Key directories

```
app/
  api/
    analyze-matchup/    # AI matchup analysis — platform-aware
    cron/               # Vercel cron routes: refresh-leagues, espn-keepalive, alerts
    espn/               # ESPN connect + league data
    leagues/data/       # Unified multi-platform data endpoint ← main dashboard API
    roster/[teamKey]/   # Yahoo roster endpoint (used by MatchupCard expand)
    sleeper/            # Sleeper connect + leagues
    user/connections/   # Which platforms the user has connected
    yahoo/              # Yahoo OAuth login/callback/status/user routes
  connect/              # Multi-platform connect page (Leagues tab)
  dashboard/            # Main dashboard page (soft-gated: un-onboarded → /welcome)
  gameday/              # Game Day hero view (also soft-gated to /welcome)
  welcome/              # First-run welcome screen → links to /onboarding
  onboarding/           # New-user setup wizard; POST /api/user/onboarding marks complete
lib/
  adapters/
    yahoo.ts            # fetchLeagueData, fetchRoster, extractStarterQB, etc.
    sleeper.ts          # fetchSleeperLeagueData, fetchSleeperRoster, lookupSleeperUser
    espn.ts             # fetchEspnLeagueData, fetchEspnRoster, validateEspnLeague
  tokenStore/index.ts   # Single token store — Yahoo tokens + Sleeper/ESPN connections
  leagueData.ts         # Shared league-data fetchers used by /api/leagues/data + cron refresh
  cache.ts              # withCache() — KV in prod, in-memory Map in dev; stale-while-revalidate
                        #   with single-flight (in-process dedupe + KV NX lock kills stampedes)
  rateLimit.ts          # Per-user KV rate limiting (AI routes etc.), bypassed in dev
  aiBudget.ts           # Daily OpenAI spend guard — blocks AI calls past the budget
  metrics.ts            # Lightweight counters/timings for observability
  db.ts                 # Optional Postgres (durable data); app runs fine without it
  season.ts             # currentNflSeason() — single source of truth (Sept cutoff)
  gameWindow.ts         # isNflGameWindow() — ET-aware, shared by server + client
  format.ts             # fmtPts() — crash-safe points formatting for the UI
  types/index.ts        # NormalizedLeague, NormalizedTeam, NormalizedMatchup, NormalizedPlayer, NormalizedRoster
  openai.ts             # chatCompletion() wrapper
  weather.ts            # getWeatherForTeams(), summarizeWeatherBrief()
  weatherOps.ts         # generateWeatherOpportunities()
  yahooOAuthState.ts    # makeState()/parseAndVerifyState() — Yahoo OAuth CSRF state (Clerk supplies userId)
  yahoo.ts              # getYahooAuthedForUser() — per-user Yahoo SDK auth
components/
  DashboardContent.tsx  # Main dashboard client component — calls /api/leagues/data
  DashboardSkeleton.tsx # Pulsing loading skeleton matching dashboard layout
  ErrorBoundary.tsx     # React class error boundary wrapping the dashboard
  MatchupCard.tsx       # Per-matchup card with expandable roster view
  AnalyzeMatchup.tsx    # AI analysis panel — platform-aware (yahoo/sleeper/espn)
  connect/
    YahooConnectCard.tsx
    SleeperConnectCard.tsx
    EspnConnectCard.tsx
tests/                  # Vitest unit tests (cache, gameWindow, nflPlays, relayAuth, season) — `npm test`
```

### Data flow

1. User visits `/dashboard`
2. `DashboardContent` calls `/api/user/connections` to check what's connected
3. If nothing connected → CTA to `/connect`
4. Otherwise → calls `/api/leagues/data` which fans out to all connected platforms
5. Returns `PlatformLeagueData[]` — one entry per platform
6. Platform tabs shown when >1 connected; user switches between them
7. AI analysis: user clicks "Analyze" on a matchup → POST to `/api/analyze-matchup` with `platform` + `leagueKey` + team keys → fetches rosters → calls OpenAI → returns `insight` object

### Normalized types

All platform adapters output `NormalizedRoster`, `NormalizedMatchup`, `NormalizedTeam`, defined in `lib/types/index.ts`. The old `lib/types.ts` legacy shapes (and the components that used them) have been removed, so `@/lib/types` now resolves to `lib/types/index.ts` — no more "use the /index path" footgun.

## Token / Connection Storage

| Data | KV key | Dev file |
|------|--------|----------|
| Yahoo OAuth tokens | `tokens:yahoo:{userId}` | `lib/yahoo-users/{userId}.json` |
| Selected Yahoo league | `league:{userId}` | `lib/yahoo-users/{userId}.league.txt` |
| Sleeper connection | `tokens:sleeper:{userId}` | `lib/yahoo-users/{userId}.sleeper.json` |
| Selected Sleeper league | `league:sleeper:{userId}` | `lib/yahoo-users/{userId}.sleeper.league.txt` |
| ESPN connection + cookies | `tokens:espn:{userId}` | `lib/yahoo-users/{userId}.espn.json` |
| My Team (per platform) | `myteam:{platform}:{userId}` | `lib/yahoo-users/{userId}.myteam.{platform}.json` |

## Required env vars

See `.env.example` for full list. Minimum for local dev:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (auth — Clerk v7)
- `YAHOO_CLIENT_ID` + `YAHOO_CLIENT_SECRET` + `YAHOO_REDIRECT_URI` (Yahoo leagues)
- `OPENAI_API_KEY` (AI analysis — optional, analyze button just won't work without it)
- `SESSION_SECRET` (any 32+ char string — signs the extension ESPN relay token AND
  derives the at-rest encryption key for stored ESPN cookies; required in prod for
  private-league ESPN sync)

Production additionally needs:
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV)
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `..._SIGN_UP_FALLBACK_REDIRECT_URL`
  (Clerk v7 post-auth redirects — the old `AFTER_SIGN_*_URL` names are ignored)

## Development

```bash
npm install
cp .env.example .env.local   # fill in secrets
npm run dev                   # http://localhost:3000
```

Yahoo OAuth redirect in dev: set `YAHOO_REDIRECT_URI=http://localhost:3000/api/yahoo/callback` in your Yahoo app and in `.env.local`.

## Conventions

- **Never add 10s polling** — the dashboard refresh is manual only (RefreshCw button)
- **Always use `cache: "no-store"`** on client fetches to internal APIs
- **Rate limiting** on `/api/analyze-matchup`: 15/hour per user via KV, bypassed in dev
- **Debug routes** gated by `DEBUG_ROUTES=1` env var — never expose in production
- **Sleeper has no projections** — the API only returns actual scored points
- **ESPN cookies** (`espn_s2` + `SWID`) are required for private ESPN leagues; public leagues need only the league ID

## Phase history

| Phase | What was built |
|-------|---------------|
| 1 | Token storage unified (`lib/tokenStore/index.ts`), dead code removed, debug routes gated |
| 2 | Normalized schema (`lib/types/index.ts`), Yahoo adapter (`lib/adapters/yahoo.ts`), cache layer |
| 3 | Sleeper adapter, ESPN adapter, multi-platform connect UI (`/connect` page), connection token store expanded |
| 4 | Unified dashboard endpoint (`/api/leagues/data`), platform-agnostic `DashboardContent`, platform switcher tabs, nav links |
| 5 | Platform-aware AI analysis (Yahoo/Sleeper/ESPN), richer prompts (named players, stacks, injuries), `AnalyzeMatchup` accepts `platform` + `leagueKey` props |
| 6 | Loading skeleton, error boundary, rate limiting (15/hr via KV), `vercel.json`, `next.config.js`, `CLAUDE.md`, `.env.example` |
