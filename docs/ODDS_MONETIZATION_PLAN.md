# Odds & Sportsbook Affiliate Monetization — Phased Plan

Status: DIRECTION SETTLED 2026-06-09. Gambling-adjacent monetization is the
chosen revenue path. The app is NOT positioned as family-friendly; "Family
Business League" was a placeholder name from the founder's own league. The
product wedge is unchanged: ESPN stays-connected reliability, phone-first,
clean feel. League HQ (docs/LEAGUE_HQ_DESIGN.md) stays on the roadmap as a
complementary, diversified revenue stream; the business should never DEPEND on
gambling revenue alone.

Reference mockup: mockups/odds-integration.html (the restrained odds tab).

## Bright lines (set now, before revenue exists)

Written while there is no money tempting us to erode them. Changing any of
these requires a deliberate, documented decision, not feature drift:

1. No bet CTAs or odds inside the Live Feed or matchup cards. Odds live in the
   Odds tab (plus, at most, a neutral spread/total chip on Game Day with no
   link-out).
2. No push notifications about odds, lines, or promos. Ever.
3. No deposit-bonus interstitials, modals, or takeovers. Affiliate placements
   are labeled, contained to the Odds tab, and visually quiet.
4. 21+ self-attestation gate on first open of the Odds tab; persistent
   responsible-gambling footer (1-800-GAMBLER) on every odds surface.
5. Geo-gating: affiliate links render only in states where (a) the partner
   book is licensed and (b) our affiliate registration covers us.
6. The Odds tab is discoverable, never forced: no redirects into it, no badge
   nagging.

## Phase A — Odds as content, no affiliate (preseason 2026, ~2-3 days eng)

Goal: ship the engagement surface, measure whether users want it, zero
compliance exposure (displaying odds is publishing, not gambling).

- Data source, in order of preference:
  1. ESPN public scoreboard odds (free, same site.api.espn.com source as
     lib/nflPlays.ts; odds array appears pre-kickoff, absent on completed
     games - VERIFY in August preseason).
  2. The Odds API (the-odds-api.com) as fallback/upgrade: free tier for
     development, ~$59/mo tier for live-season volume. One global fetch per
     5-10 min cached in KV (`odds:nfl:current`) via the existing withCache
     infra; cost does not scale with users.
- Build: lib/odds.ts (fetch + normalize: spread, total, moneyline per game),
  /api/odds route (Clerk-authed, cached), /odds page implementing the
  restrained mockup. Tab in the nav AFTER the core four.
- Gates: first-open 21+ self-attestation stored per user (`odds:ack:{userId}`),
  RG footer component shared across odds surfaces.
- Measurement (this is the point of Phase A): record events (lib/db.ts
  recordEvent once Postgres is provisioned, KV counters until then): odds tab
  opens, repeat opens per user per week, session retention with/without odds
  usage. Decision input for Phase B.
- Copy: neutral, informational. No "bet now" language anywhere.

## Phase B — Affiliate activation (gate: sustained in-season traffic,
## roughly 2-5k weekly actives; ~1 week eng + calendar time)

Do NOT start before the traffic gate: affiliate revenue at small scale is
near zero while licensing costs and obligations are fixed.

1. Partner: sign ONE sportsbook affiliate program first (DraftKings, FanDuel,
   or Caesars, direct or via their networks). Single-partner keeps
   compliance, tracking, and the UI simple.
2. Licensing/registration (engage a gaming-compliance attorney; requirements
   change): state affiliate/vendor registrations where the CPA model requires
   them (NJ, PA, CO, MI, IN are the usual first set). Budget for fees and
   processing time (weeks to months). Revenue-share vs CPA affects which
   states require what; verify current rules at signing time.
3. Geo-gating: Vercel request geo (request.geo.region) determines whether
   affiliate links render; non-covered states see the same odds content with
   no link-outs.
4. Disclosure: clear "Paid partnership" labeling on every affiliate placement;
   update /terms and /privacy (affiliate tracking disclosure).
5. Tracking: partner-provided links with subId attribution; land conversions
   in the events table for revenue-per-user math.

## Phase C — Contextual depth, inside the bright lines (in-season iteration)

Only after Phase B proves conversion and the bright lines have held:

- Player props relevant to the user's rosters, shown INSIDE the Odds tab
  ("players you start this week").
- "Your matchups, the lines" view inside the tab (game lines for the NFL games
  your starters play in).
- A/B the neutral Game Day spread/total chip (no link) for engagement.
- Revisit a second book partner only if the first's coverage gaps cost real
  revenue.

## Explicitly out of scope

- Building or operating any wagering ourselves (license-heavy, different
  business).
- DFS-style paid contests (regulated as gaming in many states).
- Odds in push notifications, the feed, or matchup cards (bright lines).

## Business notes

- CPA economics only matter at scale: $150-350 per funded bettor x a 1-3%
  user conversion needs tens of thousands of users before it pays a salary.
  The adoption roadmap (free product, season retention) is unchanged and
  remains the priority; this plan rides on top of it.
- Brand/domain cleanup is now a real task: the product is League Blitz but
  lives at familybizfootball.com (and the landing mock shows leagueblitz.app).
  Decide the canonical brand/domain before Phase B marketing pushes traffic
  at it. Hardcoded origins to update if the domain changes: lib/espnBookmarklet.ts
  FBL_ORIGIN, extension/background.js FBL_RELAY/FBL_TOKEN_URL + manifest
  host_permissions/content_scripts, PUBLIC_BASE_URL env, app/layout.tsx
  metadataBase fallback, Yahoo/Clerk OAuth redirect URLs.
- App store note: the web app + extension are unaffected, but if native apps
  ever happen, gambling content changes age ratings and regional availability.
