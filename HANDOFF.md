# League Blitz — Session Handoff (2026-06-09, late night)

Read this first in any new session. Supersedes the 2026-06-01 handoff (its
strategy content lives on in section 5 and `docs/ODDS_MONETIZATION_PLAN.md`;
the old version is in git history at commit 147feb8 and earlier).
CLAUDE.md is the architecture reference; this is the state-of-the-world.

---

## 1. The one thing in flight RIGHT NOW

**Clerk production-instance migration, mid-flight.** Production currently runs
on Clerk DEVELOPMENT keys (clerk.accounts.dev). Kyle was in the Clerk
dashboard (app "Fantasy Football App") about to:

1. Instance dropdown (top bar) -> Create production instance -> domain
   `leagueblitz.app` -> clone dev settings.
2. Add the CNAMEs Clerk shows into VERCEL DNS (vercel.com -> Domains ->
   leagueblitz.app -> DNS records). NOT Squarespace; nameservers moved to
   Vercel.
3. Configure -> Webhooks in the NEW prod instance: endpoint
   `https://leagueblitz.app/api/webhooks/clerk`, subscribe `user.deleted`,
   copy the signing secret.
4. Put three values into Vercel prod env (paste at the CLI prompts, never in
   chat):
   - `! npx vercel env rm NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production --yes && npx vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production`
   - `! npx vercel env rm CLERK_SECRET_KEY production --yes && npx vercel env add CLERK_SECRET_KEY production`
   - `! npx vercel env add CLERK_WEBHOOK_SIGNING_SECRET production`
5. `! npx vercel --prod` to deploy.

**Known consequences (already explained, not surprises):** prod users start
from zero (the two dev-instance Kyle accounts do not transfer), and Kyle's
league connections are keyed to his dev Clerk userId, so after the switch he
signs up fresh on prod and reconnects Yahoo/Sleeper/ESPN once. If social
sign-in (Google etc.) was enabled in dev, the prod instance needs real OAuth
credentials configured in Clerk.

**Verify after the deploy:** sign-in on https://leagueblitz.app references
clerk.leagueblitz.app (not clerk.accounts.dev); reconnect platforms; dashboard
loads leagues.

## 2. Remaining manual checklist (besides #1)

| Item | Where | Notes |
|---|---|---|
| Revoke leaked Yahoo refresh token | Yahoo ACCOUNT (not developer) -> Security -> Manage app and website connections -> remove "Famiz Biz Final" -> reconnect Yahoo in the app | LAST open item from the security review. Token purged from git but valid until revoked. Yahoo has no regenerate-secret UI; this is the kill switch. Combines naturally with the Clerk reconnect in #1. |
| Rotate SESSION_SECRET | Vercel env + redeploy | Pre-existing flag from the 06-01 handoff ("exposed earlier"). CAVEAT: it derives the AES key for stored ESPN cookies, so rotation invalidates stored ESPN creds (users re-sync once) and outstanding relay tokens (self-heal). Cheapest while the user base is just Kyle - do it together with #1's reconnect. |
| Old-domain redirect | Vercel -> fbl project -> Settings -> Domains -> familybizfootball.com -> Redirect to leagueblitz.app | One click. The 301 also tells Google about the move. |
| Reload dev extension + re-grab bookmarklet | chrome://extensions refresh; drag fresh bookmarklet from /connect | Old bookmarklets carry retired v1 tokens and are rejected. |
| Search Console / GA / GTM property for leagueblitz.app | Google consoles | Optional, SEO/analytics continuity. |
| Chrome Web Store extension submission | extension/ ready; copy in extension/STORE_LISTING.md (updated to leagueblitz.app) | Then paste the store URL into EspnConnectCard.tsx ESPN_EXTENSION_STORE_URL. Needs the $5 dev account + screenshots. |
| Neon/Supabase Postgres (optional until League HQ) | Vercel Marketplace | Then `psql "$POSTGRES_URL" -f db/schema.sql`; lib/db.ts activates on POSTGRES_URL. |
| ALERT_WEBHOOK_URL (optional) | Vercel env | Discord webhook for hourly platform-outage alerts. |

## 3. What shipped this session (all on `main`, all deployed + verified)

Full plan with every item: REMEDIATION_PLAN.md (all phases complete).

| Commit | What |
|---|---|
| 20b0273 | Phase 0: committed Yahoo token purged from ALL git history (filter-repo + force push; gitleaks clean) |
| 75a86ff | Phase 1: security hardening (prod fail-closed via lib/prodGuards.ts in middleware, Yahoo refresh mutex, relay tokens v2: 2h TTL + revocable + fresh-token rule for new connections, encrypted legacy ESPN key, debug surface locked), Sunday bugs (analyze-matchup multi-league ESPN fix, game-window end bounds, next.config merge, logged AI parse failures), funnel UX (Yahoo OAuth error banners + return path, Game Day off-season state, My Team error state, Rankings you-highlight, connect-failure surfacing) |
| 18c0300 | Phase 2: SWR + single-flight cache (lib/cache.ts), league registry, 3 crons (refresh-leagues */10 game-window-gated, espn-keepalive nightly Disney re-mint + health records, alerts), ESPN relay snapshot diet, batched /api/rosters/batch, AI result caching + global daily OpenAI budget, weather cache, data-route rate limits, real /api/health (+?deep=1 canaries), adapter metrics, CI actually gates, 30 unit tests |
| 783758d | Phase 2E: db/schema.sql (users/connections/health/events + League HQ ledger tables) + lib/db.ts (no-op until POSTGRES_URL) |
| 259e046 | Phase 3: em-dash/glyph sweep, PWA (public/ icons + manifest, installable), 44px touch targets, a11y (feed chips, focus rings, status text), /terms + /support + footer links, Clerk user.deleted webhook -> wipeUserData, ESPN sync-once copy rewrite |
| 78df89b | Phase 4: commissioner toggle (commish:{platform}:{leagueId}:{userId}), YOUR WEEK strip, /share/matchup + /api/og/matchup share cards, OffseasonPanel, docs for League HQ + Web Push |
| cd598ec | metadataBase fix (found during the runtime verification pass) |
| 147feb8 | Domain move code: leagueblitz.app canonical, bookmarklet built from window.location.origin, extension v1.5.0 matches BOTH domains |
| 6202743 | Odds tab Phase A (section 5) |

Runtime verification was done against a live dev server + a production build:
auth gates, relay token rejection (incl. old-format tokens), cron bearer auth,
PWA assets, share/OG canonical URLs, health, em-dash scan. 35/35 vitest tests;
CI gates lint/tsc/test/build (Node 20).

## 4. Domain state

- **Canonical: https://leagueblitz.app** - live, verified. Nameservers are
  Vercel's (ns1/ns2.vercel-dns.com), so ALL DNS edits happen in Vercel.
- familybizfootball.com still serves (redirect not yet enabled).
- Yahoo dev app = **"Famiz Biz Final"** (App ID yQfprMqk). Its ONLY redirect
  URI is `https://leagueblitz.app/api/yahoo/callback` (Kyle replaced rather
  than added), so new Yahoo connects work ONLY from leagueblitz.app.
- Env flipped in prod+dev and deployed: PUBLIC_BASE_URL, YAHOO_REDIRECT_URI.
  CRON_SECRET added and active.

## 5. Monetization: DIRECTION CHANGED 2026-06-09

Gambling/odds affiliate is now THE chosen path. Kyle clarified the app was
never meant to be family-friendly; "Family Business" was a placeholder from
his own league's name. Read **docs/ODDS_MONETIZATION_PLAN.md** before touching
anything odds-related - the bright lines are written there (no odds in
feed/matchup cards, no odds push notifications, no deposit interstitials, 21+
gate, geo-gating, contained Odds tab only).

**Phase A is BUILT and LIVE** (6202743): /odds nav tab, 21+ self-attestation
(odds:ack:{userId}), ESPN public scoreboard lines with The Odds API drop-in
when ODDS_API_KEY is set, global cache odds:nfl:current (10 min / 5 in game
windows), off-season empty state (the current June experience), RG footer on
every state, NO link-outs anywhere, measurement live (odds:opens:{date},
odds:lastopen:{userId}, recordEvent mirror).

**Phase B (affiliate links) is gated** on ~2-5k weekly actives + ONE book
partner + state affiliate licensing (gaming attorney). Do not build early -
licensing costs are fixed, revenue scales with traffic.

League HQ (commissioner dues, docs/LEAGUE_HQ_DESIGN.md) stays on the roadmap
as diversification: never let the business depend on gambling alone. Web Push
design: docs/PUSH_NOTIFICATIONS.md - the highest-value pre-season build left
(~4 days).

The 06-01 competitive analysis still holds: FantasyPros Game Day already does
cross-league live scoring free; the real wedge is (1) ESPN stays-connected
reliability (now backed by the nightly keep-alive cron), (2) phone-first clean
feel (now PWA-installable), (3) group/social angle (de-emphasized since the
positioning change).

## 6. Env var inventory (Vercel)

Required in prod (all present as of tonight): NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
CLERK_SECRET_KEY (both still DEV-instance values until #1 completes),
YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, YAHOO_REDIRECT_URI, SESSION_SECRET,
KV_REST_API_URL, KV_REST_API_TOKEN, CRON_SECRET. lib/prodGuards.ts hard-fails
the first request if SESSION_SECRET/KV go missing.
Pending: CLERK_WEBHOOK_SIGNING_SECRET (with #1).
Optional: OPENAI_API_KEY (present), PUBLIC_BASE_URL (present),
ALERT_WEBHOOK_URL, OPENAI_DAILY_TOKEN_BUDGET (default 2M tokens/day),
ODDS_API_KEY, POSTGRES_URL, DEBUG_ROUTES (NEVER in prod).
Local dev: `npx vercel env pull .env.local --environment=development --yes`.

## 7. Season-readiness watchlist (June; week 1 is ~3 months out)

1. Finish #1 + Yahoo revocation + SESSION_SECRET rotation -> zero known
   security debt.
2. AUGUST PRESEASON: verify live that (a) ESPN scoreboard odds render in the
   Odds tab and (b) the Live Feed play-by-play works on real games (both are
   unit-tested against fixtures only; live shapes unverified off-season).
3. Confirm the 3 crons actually run in the Vercel dashboard (sub-daily crons
   need a paid plan; refresh-leagues is */10).
4. Build Web Push (docs/PUSH_NOTIFICATIONS.md).
5. Off-season growth window is July-August when leagues form: share cards +
   Off-Season HQ exist; consider draft-prep content.

## 8. Conventions / rules (carry forward, unchanged)

- **No emojis anywhere in the UI, ever.** lucide-react or inline SVG.
- **No em dashes or en dashes in UI copy.** Periods, commas, "to", parens.
- **No 10s polling.** Manual refresh + 45s auto only during NFL game windows
  (lib/gameWindow.ts has explicit end bounds now).
- **Always `cache: "no-store"`** on client fetches to internal APIs.
- Display name **"League Blitz"**; domain **leagueblitz.app**; technical
  identifiers stay **fbl-*** (Vercel project fbl-lr92, repo fbl/).
- Debug routes/pages gated by `DEBUG_ROUTES=1`.
- Odds bright lines in docs/ODDS_MONETIZATION_PLAN.md are inviolable without
  a deliberate documented decision.

## 9. Key technical context / gotchas

- Next.js 14 App Router, TypeScript, Tailwind pitch palette + themeable
  --accent vars, Clerk v7, Vercel KV (Upstash PAYG).
- **KV gotcha (history):** the prod Upstash DB was once auto-deleted on the
  free tier and silently broke all persistence. Now PAYG + prodGuards makes
  missing KV fail loudly. If persistence breaks, check KV env/DB first.
- ESPN strategy: capture session once on desktop (extension/bookmarklet) ->
  server refreshes ONESITE token (reactively + nightly cron) -> phone works
  forever. No email/password ever.
- The repo is `/Users/celticwinter/Projects/football/fbl`. Mockups in
  mockups/ (odds-integration.html is the Odds tab reference; demo Trophy
  Case/Message Board live only on /dashboard/demo).
- Tests: `npm test` (vitest, 35). CI: .github/workflows/ci.yml gates
  lint/tsc/test/build.
