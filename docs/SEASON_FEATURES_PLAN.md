# Season One Feature Plan (agreed 2026-06-10)

Seven features to ship before/around week 1 (~Sept 10). Goal: retention
in-season, conversion in the July-August window. Total ~12-15 build days.
CBS/NFL.com platform support was considered and deferred.

| # | Feature | Window | Effort | Status |
|---|---------|--------|--------|--------|
| 1 | Lineup alerts | June | ~2d | BUILT 2026-06-10 (v1: status-based; empty-slot + bye verification in August) |
| 2 | Demo mode | June | ~1-2d | BUILT 2026-06-10 (/demo public, landing CTA) |
| 3 | Weekly recap push + share card | early July | ~2d | BUILT 2026-06-10 (/recap, /share/week, recap pref default ON, finals now opt-in) |
| 4 | Trophy Case (real data) | July | ~2-3d | planned |
| 5 | Draft-prep content | early July | editorial | planned |
| 6 | AI trade analyzer | August | ~2-3d | planned |
| 7 | Cross-league waiver intel | August | ~3d | planned |

## 1. Lineup alerts (the indispensable one)

Push: "Tyreek Hill is OUT, still starting in 2 of your leagues" before
kickoff windows (Sun morning ET, pre-Thu/Mon evening). Builds on the push
system (lib/push.ts, push-dispatch cron) and roster data (NormalizedPlayer
has status + kickoffMs).

- v1: injury-status starters (Out/IR/Doubtful/Suspended/PUP), one alert per
  player per user per game day (markSentOnce), only before that player's
  kickoff when kickoffMs is known.
- v1.1 (later): empty-slot detection (needs rosterPositions joined to the
  roster payload); bye-week detection (verify platform data in August).
- New pref `lineup` (default ON) in PushPrefs + NotificationsCard toggle.
- Alert windows run OUTSIDE game windows: extend push-dispatch gating with
  an isLineupAlertWindow() (ET): Sun 09:00-12:55, Thu 17:00-20:10,
  Mon 17:00-20:10.

## 2. Demo mode (the conversion one)

Public read-only sample dashboard ("See it in action" on the landing page),
built from the existing /dashboard/demo + mock data, refreshed to current
look (Trophy Case, Game Day). Persistent "This is a sample, connect yours
free" banner. Public route in middleware. Show the full tour: dashboard,
gameday, rankings.

## 3. Weekly recap (the billboard one)

Tuesday-morning push aggregating the week: "3-1 across 4 leagues. Top
player: Bijan Robinson, 28.4." Opens /recap page with per-league breakdown
+ Share button producing an OG card (existing /api/og infra). Recap becomes
the default end-of-week push; per-league finals become opt-in (notification
volume stays polite). Builds on finals detection (window-end logic in
push-dispatch).

## 4. Trophy Case (the emotional one)

Real league history: champions by year, best season, streaks, blowouts.
Sources: Yahoo past-season league keys, Sleeper previous_league_id chain,
ESPN league-history endpoint. Store once (KV or Postgres if provisioned),
render the existing demo UI with real data. Foundation for the November
Store concept (champion names/records).

## 5. Draft-prep content (the SEO one)

Public pages for July indexing: positional rankings/guides, printable
cheat-sheet generator with League Blitz branding. AI-drafted, Kyle-reviewed.
Only worth doing if shipped early July (indexing lag). Decision owner: Kyle.

## 6. AI trade analyzer (the shareable one)

League-aware picker (your roster vs theirs), AI verdict with fairness score
and lineup impact, shareable verdict card. Reuses chatCompletion + aiBudget
+ rate limits + share-card infra. Usage peaks Oct-Nov; ship by week 1.

## 7. Cross-league waiver intel (the power-user one)

Trending players (Sleeper public trending-adds API) tagged with per-league
availability. v1 availability: Sleeper (full rosters, one call) + Yahoo
(availability search API); ESPN shows "check your league". The future Pro
anchor candidate.

## Standing rules

All bright lines hold (docs/ODDS_MONETIZATION_PLAN.md): no odds in
notifications/feed/cards. No emojis, no em/en dashes in UI. No 10s polling.
Push notification volume: default set stays conservative (lineup + TD +
recap), everything else opt-in.
