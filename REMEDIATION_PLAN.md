# League Blitz — Full Remediation & Hardening Plan

Source: comprehensive app review 2026-06-09 (security, bugs, scalability, UX/product).
Every finding from that review is mapped to a task below. Tasks are numbered for
tracking; phases are ordered by risk and dependency. Effort assumes one developer.

---

## Phase 0 — EMERGENCY (today, ~1-2 hours)

**0.1 Revoke the committed Yahoo token.**
`lib/yahoo-tokens.json` is tracked in git and pushed to `origin/main`; it contains a
live long-lived refresh token. Revoke it in the Yahoo developer console (or from the
Yahoo account's authorized-apps page) FIRST, before touching the repo.

**0.2 Delete the file and block recurrence.**
- Delete `lib/yahoo-tokens.json` (dead code, nothing imports it).
- Add to `.gitignore`: `lib/yahoo-tokens.json`, `lib/yahoo-users/`.

**0.3 Purge from git history.**
`git filter-repo --path lib/yahoo-tokens.json --invert-paths`, force-push, and
invalidate any clones/forks. The token stays compromised until 0.1 is done regardless.

**0.4 Secret sweep.**
Run `gitleaks detect` (or `trufflehog`) over full history to confirm nothing else is
committed. Rotate anything found.

Acceptance: token revoked at Yahoo; `git log --all -- lib/yahoo-tokens.json` empty;
gitleaks clean.

---

## Phase 1 — Production correctness & security hardening (~3 days)

### 1A. Fail-closed configuration (half day)

**1.1 SESSION_SECRET hard-fail in prod.**
`lib/tokenStore/index.ts:20-28` silently stores ESPN cookies as plaintext when
`SESSION_SECRET` is unset, and relay auth silently disables. In production
(`process.env.VERCEL` or `NODE_ENV==='production'`), throw at module load if absent.
Wire into `lib/envCheck.ts`.

**1.2 KV hard-fail in prod.**
`isKvAvailable()` false on Vercel means the file fallback silently no-ops (read-only
FS) and the app persists nothing while appearing healthy. Throw when
`VERCEL && !KV_REST_API_URL`.

**1.3 Rate limits fail closed in prod.**
`checkRateLimit` in analyze-matchup/analyze-roster/gameday-narrative returns `true`
when KV is absent or errors. In prod, deny on KV error instead. Also stop truncating
the key to `userId.slice(0,16)` — use the full userId (all three routes).

### 1B. Input validation & endpoint hygiene (half day)

**1.4 Cap analyze-roster input.**
`app/api/analyze-roster/route.ts` feeds attacker-supplied `starters`/`bench` straight
into the OpenAI prompt. Add zod: max array lengths (~25), max string lengths (~60/field),
reject extra keys.

**1.5 Validate `leagueId` format.**
Apply the relay routes' `^[a-zA-Z0-9_.-]+$` check to `app/api/espn/connect/route.ts`
and `app/api/user/league-teams/route.ts` before URL construction.

**1.6 Remove `conns[0]` fallback.**
`user/league-teams` ESPN branch: return `not_connected` when no exact `leagueId`
match instead of proxying arbitrary public leagues.

**1.7 Strip `_debug` from client responses.**
`espn/connect` returns `_debug: exchangeDebug` on `validation_failed`. Only include
when `DEBUG_ROUTES==='1'`.

**1.8 Lock down debug surface.**
- Gate pages `app/debug/page.tsx`, `app/debug/ai-logs/page.tsx`,
  `app/debug/auth-diagnostic/page.tsx` with the same `notFound()` pattern as
  `app/dashboard/demo/page.tsx:23`.
- Delete (preferred) or Clerk-gate + admin-gate: `api/debug/ai-logs/[date]` (returns
  ALL users' AI logs), `api/debug/file-system` (lists all userIds), and require Clerk
  auth on `api/espn/debug-token` (currently an env-gated Disney token oracle).
- Confirm `DEBUG_ROUTES` unset in Vercel prod env.

### 1C. Relay token hardening (half day)

**1.9 Shorten + revocable relay tokens.**
`lib/relayAuth.ts` token is `{userId}:{ts}:{hmac}`, 24h TTL, replayable, stored in
cleartext bookmarks (sync-replicated). Changes:
- TTL to 1h; extension re-mints via `/api/espn/relay-token` on demand (it has a Clerk
  session cookie when the user is signed in; `chrome.alarms` sync should re-mint).
- Add a per-user token version/nonce in KV (`relaytok:ver:{userId}`); embed in token;
  bump to revoke all outstanding tokens.
- `relay-creds` and `discovered-leagues` currently CREATE connections for any token
  holder; require an existing matching connection or a server-issued challenge, like
  `relay/route.ts:54-58` already does.
- Bookmarklet UI: note that bookmark sync exposes the token; prefer the extension path.

**1.10 Fix plaintext legacy ESPN key.**
`saveEspnConnection` (`lib/tokenStore/index.ts:369-384`) writes encrypted data to the
new multi-league key AND the raw unencrypted object to legacy `tokens:espn:{userId}`.
Encrypt the legacy write (or drop it), and add a one-time migration that re-encrypts /
deletes existing plaintext legacy keys.

### 1D. Sunday-critical bugs (1 day)

**1.11 Yahoo token refresh mutex.**
`lib/tokenStore/index.ts:639-715`: concurrent refreshes race; the loser gets
`invalid_grant` and `clearUserTokens` wipes the winner's fresh tokens.
- Per-userId in-flight promise map (dedupes within one serverless instance).
- KV `SET NX` lock with short TTL for cross-instance dedup; on lock contention, wait
  and re-read tokens instead of refreshing.
- On `invalid_grant`, re-read stored tokens before clearing — only clear if the stored
  refresh token equals the one that just failed.

**1.12 analyze-matchup ESPN multi-league fix.**
`app/api/analyze-matchup/route.ts:262` uses legacy `readEspnConnection` (null for
post-migration users → broken AI analysis on private ESPN leagues). Replace with
`readEspnConnections(userId)` and match `c.leagueId === leagueKey`, fallback first conn.

**1.13 Close the game windows.**
`lib/gameWindow.ts` opens windows but never closes them (Sunday polls until midnight+).
Add per-day end bounds: Sun 12:00–24:00 is still too wide — use Sun 12:55 PM–11:59 PM ET
realistic: `day===0: 765–1440`? Keep simple: Sun noon→midnight, Mon/Thu 7 PM→midnight,
Sat (late-season) 1 PM→10 PM. The key fix is each branch gets an upper bound so Monday
1 AM is OFF.

**1.14 Merge next.config.**
`next.config.js` wins (verified: Next CONFIG_FILES order is `.js` then `.mjs`), so the
`.mjs` `onDemandEntries` dev tweak is dead. Merge both into a single `next.config.mjs`
(webpack `fs:false` fallback + dev onDemandEntries), delete the other, verify build.

**1.15 Stop swallowing OpenAI failures.**
`analyze-matchup/route.ts:422-444` and `analyze-roster/route.ts:~150`: bare `catch {}`
around `JSON.parse(raw)` returns `ok:true` with an empty insight. Add `console.error`
with route tag, and return a `degraded: true` flag the UI can use to show "analysis
unavailable, try again" instead of a blank panel.

**1.16 Small correctness fixes.**
- `lib/adapters/sleeper.ts:381-404`: `toPlayer(pid, slots[i] ?? "BN")` + warn log when
  `starters.length > slots.length` (SuperFlex/OP leagues).
- `components/MatchupCard.tsx:100-133`: AbortController + unmount guard on
  `loadRosters`/`fetchRosterData`.
- `components/DashboardContent.tsx:219`: standings rows `key={t.name}` not index.
- `lib/nflPlays.ts:143-150`: tighten "pass from" passer capture so trailing metadata
  ("at 2:34") doesn't poison the name match and silently drop plays.
- `components/AnalyzeMatchup.tsx` `mapError`: add a friendly case for
  `env_validation_failed` (currently shows the raw code).
- Delete dead code: `lib/oauthTempStorage.ts` (verify zero imports first), empty
  `pages/` directory.

### 1E. Funnel-critical UX (1 day)

**1.17 Yahoo OAuth failure paths.**
`app/api/yahoo/callback/route.ts:23,31,58,69`: every failure (user clicked "No thanks"
→ `error=access_denied`, missing code, state mismatch, token-exchange failure, crash)
returns raw JSON in the browser. Redirect ALL paths to
`/connect?auth=error&reason=<code>`; `ConnectHub`/`YahooConnectCard` render a friendly
banner per reason with a retry button. Preserve the existing `?auth=success` path.

**1.18 Game Day state logic.**
`components/GameDayContent.tsx:119-159,234`: split `noTeamsSelected` into
`noConnections` / `noTeams` / off-season (mirror FeedContent's approach). The
off-season state at lines 266-282 is currently unreachable — make it reachable. A
fully-connected user in June must see "matchups appear when the season kicks off",
not "PICK YOUR TEAMS".

**1.19 My Team error state.**
`components/MyTeamContent.tsx:332-333`: outer catch sets `setNoTeams(true)` — outages
render as "NO TEAM SET" (user error). Add a distinct error state + retry like the
other pages.

**1.20 Surface connect failures.**
`YahooConnectCard.tsx:76`, `SleeperConnectCard.tsx:101`: `if (!j.ok) return;` and no
`.catch` on add/remove/team-pick fetches. Add error state + message to both cards
(EspnConnectCard already does this — match it).

**1.21 Don't wipe the Game Day narrative.**
`GameDayContent.tsx:161`: the 45s silent refresh calls `setNarrative(null)`, deleting
the AI summary the user just generated. Only clear narrative on week/team change.

**1.22 Rankings fixes.**
`components/AwardsContent.tsx:190-194`: read `myTeam` from `connections.leagues[]`
(it's nested per-league, not platform-level) so the "you" row highlight actually
renders. `:253-266`: label tabs by league name, not platform (two Yahoo leagues
currently produce two identical "Yahoo" tabs). Also consume `loadErrors` so expired
credentials show a banner here like the other pages.

**1.23 Onboarding continuity.**
Yahoo OAuth from wizard step 2 ejects to `/connect?auth=success` and never marks
onboarding complete on that path. Pass a `from=onboarding` hint through OAuth state
(or sessionStorage) and return the user to the wizard step; on the wizard "Done" path,
mark complete before routing to "Connect More Leagues" so users don't loop
/gameday → /welcome → /onboarding.

Phase 1 acceptance: `tsc` + `next build` clean; manual walkthrough of: Yahoo connect
cancel, Sleeper bad username, expired-token dashboard load, Game Day in off-season,
analyze on an ESPN league, debug URLs 404 in prod config.

---

## Phase 2 — Scale & reliability foundation (~1.5 weeks)

### 2A. Caching & fan-out (2-3 days)

**2.1 Request coalescing in `lib/cache.ts`.**
`withCache` has no stampede protection: hot-key expiry fires N simultaneous upstream
fetches. Add (a) in-process in-flight promise map keyed by cache key, (b) KV `SET NX`
short-TTL lock for cross-instance dedup, (c) stale-while-revalidate: serve the expired
value while one worker refreshes.

**2.2 Cron-built league snapshots ("everyone reads, nobody fetches").**
Vercel Cron (now allowed in `vercel.json`) that, during game windows, walks active
leagues and refreshes `unified:{platform}:{league}:{week}` snapshots server-side.
User requests become pure KV reads. This is the single biggest scale win — removes
the Yahoo per-app quota ceiling (~120k calls/hr at 1k users today) and most KV
stampedes. Requires a registry of active leagues (KV set updated at connect time;
graduates to Postgres in 2.6).

**2.3 ESPN credential keep-alive cron (the moat).**
Today ESPN re-mint only happens reactively inside user requests or via the extension's
hourly alarm (requires the user's desktop Chrome open). Nightly cron: walk ESPN
connections, exercise the Disney refresh path, persist fresh `espn_s2`, record
per-connection health (`espnhealth:{userId}:{leagueId}`). Surface "connection
unhealthy since <date>, re-sync" in the UI from that record. "Stays connected" becomes
true by construction.

**2.4 ESPN relay blob diet.**
`leagues/data/route.ts:265` reads the raw relay league JSON (can be 100s of KB) from
KV per user per request — the KV bandwidth killer. Parse/normalize once at relay POST
time, store only the normalized result, keep raw short-TTL for debugging only.

**2.5 Batched feed roster endpoint.**
`components/FeedContent.tsx:267-304` makes 2 roster calls per league, each its own
function invocation. Add `POST /api/rosters/batch` (list of team keys → one response);
feed and Game Day use it. Cuts feed-poll invocations ~5-7 → ~3.

### 2B. Cost guards (1 day)

**2.6 Cache AI results.**
Key `ai:matchup:{league}:{week}:{aKey}:{bKey}` (and roster/narrative equivalents),
TTL 1h during games, longer otherwise. Ten league-mates analyzing the same matchup
should cost one OpenAI call.

**2.7 Global daily OpenAI budget.**
KV counter `openai:spend:{date}` incremented per call (estimate tokens); hard daily
ceiling, friendly "AI is resting until tomorrow" error past it. Removes the unbounded
worst case (1k users × 15/hr indefinitely).

**2.8 Model + weather fixes.**
- `gameday/narrative/route.ts:90`: gpt-3.5-turbo → gpt-4o-mini (cheaper, better).
- `lib/weather.ts:95`: per-stadium cache, 1h TTL (today: up to ~28 uncached Open-Meteo
  calls per analysis; free tier dies ~400 analyses/day).

**2.9 Generic rate limiting on data routes.**
Nothing stops a script hammering `/api/leagues/data` today. KV-based per-user limiter
(e.g. 60/min) on leagues/data, roster, feed/plays — or Vercel WAF rules.

### 2C. Observability (1-2 days)

**2.10 Sentry** (or equivalent): server routes + client ErrorBoundary
(`components/ErrorBoundary.tsx` currently only console.errors — you never hear about
prod breakage).

**2.11 Real health checks.**
`app/api/health/route.ts` checks env vars only. Add: KV round-trip ping, Sleeper
public-league canary fetch, ESPN public-API canary, last-success timestamps per
platform from 2.12. ESPN being 100% down must not report "healthy".

**2.12 Platform error-rate counters + alerting.**
KV counters per platform per hour written from the adapters' failure paths; cron
checks thresholds and alerts (email or Discord webhook). Goal: ESPN breaking Saturday
night pages YOU Saturday night, not your users Sunday noon.

### 2D. Tests & CI (1-2 days)

**2.13 Real CI gating.**
`.github/workflows/ci.yml`: remove `|| true` from lint; add `tsc --noEmit`; replace
the fake smoke test (`node -e "console.log('Build complete')"`) with an actual boot +
`GET /api/health` check.

**2.14 Adapter unit tests.**
Vitest. Highest-value targets: Yahoo response parser (deeply nested JSON), ESPN roster
parser, Sleeper slot mapping (incl. the SuperFlex case from 1.16), `lib/nflPlays.ts`
play-string parser (already validated against Week 15 2024 — turn those cases into
fixtures), `lib/season.ts` / `lib/gameWindow.ts` boundary times (TZ-pinned), relay
token sign/verify/expiry, encryptField round-trip.

### 2E. Database (2-3 days, can slip to Phase 4 if needed)

**2.15 Postgres (Neon/Supabase) for durable data.**
KV stays as cache only. Move/mirror: users, connections metadata (NOT raw secrets —
those stay encrypted in KV), active-league registry (feeds 2.2), connection health
(2.3), analytics events. Hard prerequisite for League HQ payments (ledger, Stripe
webhooks, idempotency — never money in KV). Also finally answers "how many users have
ESPN connected".

Phase 2 acceptance: load-test `/api/leagues/data` + feed poll at simulated 500
concurrent (k6/artillery) — zero upstream stampede (verify via counters), KV
commands/request within budget; kill ESPN canary and confirm alert fires.

---

## Phase 3 — Product polish & compliance (before season, ~1 week)

### 3A. Style-rule sweep (half day)

**3.1 Em/en dash sweep in UI copy.**
Replace in: `app/page.tsx:36,123,125`, `app/welcome/page.tsx:39`,
`app/privacy/page.tsx:23,31`, `app/layout.tsx:41` (aria-label),
`app/onboarding/OnboardingWizard.tsx:13,52,86`,
`components/connect/EspnConnectCard.tsx:306,323,331,375,376`,
`components/connect/SleeperConnectCard.tsx:197`,
`components/connect/EspnBookmarklet.tsx:60`, `components/LeagueErrorBanner.tsx:16`,
`components/DashboardContent.tsx:186`, `components/ErrorBoundary.tsx:45`,
`components/GameDayContent.tsx:224`, and user-facing error strings in
`app/api/leagues/data/route.ts:148,201,295,296`. Decide the numeric placeholder
("—" in MatchupCard, MyTeamContent:98, AwardsContent:347, AnalyzeMatchup:124-147):
swap for "-" or styled "0.0". Add a lint/grep CI check so they don't creep back.

**3.2 Unicode glyph icons → lucide.**
`▲▼` → ChevronUp/ChevronDown: `GameDayContent.tsx:438`, `MatchupCard.tsx:306,446`,
`DashboardContent.tsx:235` (rank movement: ArrowUp/ArrowDown). `▶` → ChevronRight:
`EspnConnectCard.tsx:355,564`. `→` text arrows in `extension/popup.js:90,113`,
`extension/popup.html:222` → SVG or copy rewrite.

**3.3 Demo-data emoji.**
"Pacheck ✅" in `data/teams.json`, `data/scoreboard.json`, `data/standings.json`,
`data/rosters*.json`.

### 3B. Phone-first basics (1 day)

**3.4 `public/` directory: favicon, app icons, PWA manifest.**
Currently none exist at all. Favicon set, apple-touch-icon, maskable icons,
`manifest.webmanifest` (name, theme-color matching pitch palette, display:
standalone), `<meta name="theme-color">`. Add-to-Home-Screen must produce a real
app-like entry. Verify middleware matcher doesn't intercept `manifest.webmanifest`
(the current regex already excludes it — confirm).

**3.5 Touch targets ≥ 44px.**
Refresh buttons (`DashboardContent.tsx:396`, `GameDayContent.tsx:313`,
`FeedContent.tsx:496`, `MyTeamContent.tsx:354`), league remove "X"
(`YahooConnectCard.tsx:222-229` and the other cards), feed filter tabs
(`FeedContent.tsx:510-520`).

**3.6 Desktop header logo.**
`app/layout.tsx:42` `md:h-40` (160px sticky band) → `md:h-20` unless intentional.

### 3C. Accessibility (half day)

**3.7** Feed you/opponent chips: red vs green alone (`FeedContent.tsx:581-585`) —
add a text token ("me"/"opp") or icon alongside color.
**3.8** Injury status dots (`MyTeamContent.tsx:89-92`): color + `title` only —
add visible status text abbreviation (Q/O/IR).
**3.9** Restore visible focus styles where `focus:outline-none` kills them
(`SleeperConnectCard.tsx:219`, `EspnConnectCard.tsx:551`, sweep others): use
`focus-visible:ring`.
**3.10** `scope="col"` on standings/roster `<th>` (minor).

### 3D. Trust & legal (1 day)

**3.11** Link `/privacy` from footer (`app/layout.tsx:56-60`) and landing page.
**3.12** Terms of Service page (`/terms`), linked alongside privacy; add both to the
middleware public-route list.
**3.13** Support/contact path (mailto or simple form) in footer + error states.
**3.14 Account deletion that actually deletes.**
Clerk user-deleted webhook (or settings-page action) that wipes ALL KV keys for the
userId: `tokens:yahoo:`, `league:`, `tokens:sleeper:`, `league:sleeper:`,
`tokens:espn:`, `leagues:espn:`, `myteam:*`, relay data, onboarding/theme keys.
Required for an app storing OAuth tokens and cookies.

### 3E. Consistency & copy (half day)

**3.15** Nav label vs page title alignment ("Scores" vs "DASHBOARD", "Leagues" vs
"CONNECT YOUR LEAGUES") — pick one vocabulary.
**3.16** Landing page: fake browser chrome shows `familybizfootball.com/gameday`
(`app/page.tsx:69`) under the League Blitz brand; metadata description generic
(`layout.tsx:26`); add per-page titles for /connect, /dashboard, /onboarding,
/welcome.
**3.17** Connect page one-off blue/green banners (`ConnectHub.tsx:53,70`) → accent
system.
**3.18** Update CLAUDE.md (theme is pitch palette, not bg-gray-900; storage docs for
new keys from Phase 2).

### 3F. ESPN flow productization (1-2 days)

**3.19 Publish the Chrome extension.**
`EspnConnectCard.tsx:9` `ESPN_EXTENSION_STORE_URL = ''` renders "coming soon" — the
core differentiator is unshipped. Finish store listing (privacy policy URL already
exists at /privacy), submit, set the URL.
**3.20 Fix contradictory ESPN copy.**
Wizard descriptor "League ID required" (`OnboardingWizard.tsx:15`) and card header
contradict the extension story; rewrite around "set up once on a computer, works on
your phone forever".
**3.21 Phone-first ESPN explanation.**
Detect mobile and show a prominent dedicated panel ("You're on a phone — do this once
on a computer, takes 2 minutes, then your phone stays synced"), instead of the current
buried parenthetical in a collapsed section (`EspnBookmarklet.tsx:60`).

Phase 3 acceptance: Lighthouse PWA installable; axe scan no criticals; grep CI rule
for em dashes/emoji passes; extension live in store.

---

## Phase 4 — Growth & revenue groundwork (season ramp, ongoing)

**4.1 Off-season content (do FIRST — it's June and leagues form over the summer).**
Minimum: season-recap cards from last year's data + draft-prep checklist. The app
currently gives a new summer signup nothing to do until September, which kills the
acquisition window.

**4.2 Web Push notifications.**
Pairs with the PWA (3.4) and existing feed plumbing (`lib/nflPlays.ts` + roster
membership). Start with: your player scored, close-game alert, final score. This is
the #1 retention feature in the category and the one future Pro-tier candidate
(HANDOFF: "consolidated cross-league alerts"). Needs the cron tier (2.2) to detect
events server-side.

**4.3 Shareability.**
Share-card image generation (Vercel OG) for AI matchup analysis and weekly awards;
public read-only matchup links. The clearest free viral lever; none exists today.

**4.4 Cross-league summary strip.**
"Your week: 3-1, 2 close games" on Game Day/dashboard top — users currently aggregate
mentally.

**4.5 Commissioner flag at connect.**
"Are you the commissioner of this league?" checkbox stored per connection (Postgres,
2.15). Seeds League HQ targeting and tells you your real commissioner count.

**4.6 League HQ MVP (the revenue path).**
Stripe Connect dues collection: commissioner sets buy-in, members pay, pot tracked,
payout at season end, flat service fee. Hard requirements before building: Postgres
ledger (2.15), idempotent webhooks, refund path, compliance review. Scope this as its
own design doc when reached.

**4.7 FantasyPros-parity backlog (deliberately later).**
Waiver/trade tools, player news. Lower priority — AI analysis + reliability is the
wedge, not parity.

---

## Sequencing summary

| Phase | Duration | Theme | Gate |
|---|---|---|---|
| 0 | Today | Revoke + purge committed token | Token revoked |
| 1 | ~3 days | Fail-closed config, Sunday bugs, funnel UX | Manual funnel walkthrough clean |
| 2 | ~1.5 weeks | Coalescing, crons, cost guards, observability, tests, Postgres | 500-user load test, alert drill |
| 3 | ~1 week | Style rules, PWA, a11y, legal, ESPN extension shipped | Lighthouse/axe/store listing |
| 4 | Ongoing | Off-season content, push, sharing, League HQ | Season launch |

Total to season-ready: roughly 4 weeks of focused work. Phases 1 and 3 can interleave;
Phase 2's cron tier (2.2/2.3) is the long pole and should start as soon as Phase 1 lands.
