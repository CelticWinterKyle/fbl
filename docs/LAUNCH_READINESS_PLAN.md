# Launch Readiness Plan — 2026 Season

Source: full launch-readiness audit run 2026-07-02 (security + season-readiness
+ ops review, every finding verified against code first-hand). Season kickoff
~Sept 10; Aug 6 preseason is the live rehearsal deadline for everything here.

Status legend: [ ] not started, [~] in progress, [x] done + verified.

---

## Step 1 — [x] Dependency security upgrades (DONE 2026-07-02)
Shipped as 6490904: next 14.2.35 + @clerk/nextjs 7.5.12 + audit fix. All
gates green; smoke verified on local, preview, and prod (leagueblitz.app:
gating 404/307 intact, health green, public pages 200). npm audit criticals
cleared; 4 accepted advisories documented below.

**Why:** `@clerk/nextjs@7.0.8` has a critical middleware route-protection
bypass (GHSA-vqx2-fgx2-5wq9, fixed 7.2.4). `next@14.2.4` (hard-pinned) predates
the middleware auth bypass fix (GHSA-f82v-jwr5-mffw, fixed 14.2.25) plus
several DoS advisories. The app's security model is default-deny Clerk
middleware, so these are blocker-class.

**Do:**
- package.json: `next` 14.2.4 -> 14.2.35 (stay on the 14.x line; do NOT jump
  to 15), `@clerk/nextjs` -> latest 7.x (>= 7.2.4), `npm audit fix` for
  js-cookie and friends. `uuid` via yahoo-fantasy is unfixable without a
  breaking downgrade; accept.
- Full gates: lint, tsc, 65 vitest, build.
- Manual smoke on a preview deploy: sign-in/sign-up, protected route behavior
  (curl 404 / browser 307), dashboard data loads, extension relay still
  authenticates, webhooks verify.

**Done when:** `npm audit --omit=dev` shows no critical/high on Clerk or next,
prod deployed and smoke-tested.

## Step 2 — [x] Yahoo + Sleeper season rollover migration (BUILT 2026-07-02)
lib/seasonRollover.ts: renewed-chain follow (Yahoo, up to 3 hops) +
previous_league_id match (Sleeper), migrating league lists, legacy single
keys, My Team (Yahoo: team id re-homed; Sleeper: roster re-derived by owner
id), commissioner flags, and the league registry. Probes negative-cached 20h.
Wired into /api/leagues/data (heals on load) and the nightly espn-keepalive
cron ("rollovers=N" in heartbeat). 14 new tests (7 pure + 7 mocked-flow).
VERIFY LIVE in August: watch rollovers > 0 as Kyle's leagues renew, then
confirm the dashboard shows the 2026 league.

**Why:** Stored Yahoo league keys embed the per-season game code (461.l.x =
2025); Sleeper mints a new league_id per season. Only ESPN has a rollover
guard (espnSeasonsToTry). Without this, week 1 shows every offseason-connected
user frozen 2025 data, and push-dispatch re-sends last season's final recap
every Tuesday. THE must-fix.

**Do:**
- Shared trigger: when a stored connection's season < currentNflSeason(),
  attempt migration (at fetch time in lib/leagueData.ts, plus nightly from the
  refresh/keepalive cron so it heals even for idle users).
- Yahoo: list the user's current-season leagues (game key nfl = current);
  match old -> new via league meta `renew`/`renewed` chain (falls back to
  name match). Persist the new league key.
- Sleeper: GET /user/{id}/leagues/nfl/{season}; match
  `previous_league_id === stored id`. Persist the new league_id.
- Migrate `myteam:{platform}:{userId}` mappings too (team keys/ids change
  with the league). Match by manager/owner where possible, else clear and let
  the UI re-prompt.
- Negative-cache failed probes (leagues renew on the platforms at different
  times; retry daily like the ESPN pattern).
- Unit tests for both matchers (renew-chain parsing, previous_league_id).

**Done when:** tests pass; a simulated stale connection (season forced to
2025) auto-migrates in dev; cron output reports migrations (mirror ESPN's
seasonsBumped counter).

## Step 3 — [ ] ESPN keepalive validation fix (July, ~1 day)

**Why:** app/api/cron/espn-keepalive re-mints the access token but validates
with the stale in-memory connection, so token-only accounts fail every night
(the persistent `unhealthy=4` in /api/health is this bug, not dead
connections). The failure also skips the season-bump probe (same try block),
disabling half the ESPN rollover self-heal. Health is permanently red, so a
REAL dead connection would be invisible.

**Do:**
- Pass the freshly minted accessToken into validateEspnLeague (and use the
  just-persisted creds, not the stale `conn`).
- Move the season-rollover probe out of the shared try so validation failure
  cannot skip it.
- Consider persisting a rotated ONESITE cookie if the exchange returns one
  (Disney refresh tokens age out ~6 months; Kyle re-synced 06-10, so
  ~December risk).

**Done when:** the morning after deploy, /api/health shows espn-keepalive
healthy=N unhealthy=0 for known-good connections.

## Step 4 — [ ] Game windows + finals gating (July, 1-2 days)

**Why:** lib/gameWindow.ts misses 2026 slates: 9:30 AM ET international
Sundays, Thanksgiving 12:30/4:30 PM games, Friday entirely (Black Friday game;
Christmas 2026 is a Friday), and the 11:45 PM ET hard stop truncates late MNF.
Worse, push-dispatch fires "you won/lost" finals + weekly recap purely on
"window just ended", so a late MNF gets non-final scores pushed and
markSentOnce suppresses any correction.

**Do:**
- Widen windows: Sun from 9:00 AM ET; Thanksgiving Thursday from 12:00 PM;
  add Fri windows for Black Friday week and Dec 25/26; extend the end bound
  past midnight (handle the day-wrap in the ET math).
- Gate finalsDue on truth, not clock: all matchups scored AND no live NFL
  games in the feed (the recap narrative route already has the all-played
  check; reuse it). Window end becomes the trigger to START checking, not the
  declaration of finality.
- Update tests/gameWindow tests for the new windows + a finals-gating test.

**Done when:** tests cover the 2026 edge slates; a simulated in-progress MNF
holds finals until scores stop moving.

## Step 5 — [ ] Yahoo roster cache scoping (July, ~1 hour)

**Why:** `roster:yahoo:v2:{teamKey}:{week}` (lib/rosterData.ts) has no
membership check: any Yahoo-connected user can read a private league's roster
if a member warmed the cache in the last 5 minutes. ESPN branch already checks
membership; Yahoo doesn't. Medium severity, trivial fix.

**Do:** scope the cache key per user (`roster:yahoo:v2:{userId}:{teamKey}:
{week}`). Cache duplication is negligible at current scale. (Alternative,
later: real membership check against the user's league list.)

**Done when:** key includes userId; cold-cache behavior unchanged.

## Step 6 — [ ] Recap week race + bye alerts + small fixes (early Aug, 1-2 days)

- **Recap Tuesday race:** generation requires platform currentWeek === recap
  week, but platforms roll Tuesday morning, after which week N 409s forever.
  Fix: recap path fetches the explicit week (all three platform APIs accept a
  week param) so week N generates even after the roll.
- **Bye-week lineup alerts:** pushDetect alerts on status "bye" but no adapter
  emits it. Emit it: Yahoo from opponent === "BYE"; ESPN/Sleeper derived from
  lib/nflSchedule.ts bye map + player team. First byes are week 5.
- **Bye map negative caching:** a failed schedule fetch caches {} for 7 days,
  silently removing bye grounding from start/sit + trade prompts. Cache
  failures briefly (e.g. 1h), not a week.
- **VAPID device test:** verify a real push lands on Kyle's phone in prod
  (env vars exist; end-to-end unconfirmed).
- **External uptime monitor:** point UptimeRobot (or similar, free) at
  /api/health — the dead-cron watchdog cannot watch itself.
- **Housekeeping:** commit the NavLinks.tsx Clerk-popover dark theme tweak;
  archive REMEDIATION_PLAN.md + YAHOO_TROUBLESHOOTING.md to docs/; fix the
  InstallPrompt.tsx useCallback lint warning.

## Step 7 — [ ] August preseason rehearsal (Aug 6+, existing season plan)

The existing HANDOFF section 5 plan, extended with audit-specific checks:
- ODDS_API_KEY provisioned; log/watch `x-requests-remaining` response headers
  to validate the $59/mo tier against real cache-refresh volume (the code
  never checks quota; exhaustion currently degrades silently to an empty
  section).
- Live verification: ESPN scoreboard odds render, Live Feed plays, player
  props, push TD alerts on real games, 4 crons green.
- NEW from audit: keepalive shows healthy (step 3 proof), a real Yahoo/Sleeper
  league auto-migrates when platforms open 2026 leagues (step 2 proof), finals
  push waits for actual game end (step 4 proof), recap generates on the first
  real Tuesday (step 6 proof).
- Decide: start/sit scorer cron + Coach's record UI and the AI waiver report
  (both still unbuilt) — make the week-1 cut or explicitly slip them.

---

## Not doing (from the audit, deliberately deferred)

- Push-dispatch sequential-loop scaling (~60-150 users/run wall-clock ceiling):
  a growth problem; the cap already pages. Shard when user count approaches it.
- /api/health unauthenticated detail (cron summaries, missing env names):
  recon surface only, no secrets. Optionally gate detail behind admin later.
- refresh-leagues unbounded Promise.allSettled fan-out: fine at current scale.
- uuid advisory via yahoo-fantasy: unfixable without breaking downgrade.
