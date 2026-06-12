# AI Coach Plan — Recaps, Start/Sit, Waiver Report

Status: PLANNED (discussed 2026-06-12, not yet built)
Build order: 1. AI recaps -> 2. Start/Sit advisor -> 3. Waiver report.
Draft assistant: deliberately EXCLUDED (the draft kit ships no player
rankings by documented decision; an AI draft tool reverses that — needs its
own decision first).

## Vision

The app already has four AI features (matchup, roster, trade, gameday
narrative). These three additions complete the weekly rhythm so the AI
"Coach" owns every day of the fantasy week:

| Day | Feature | Push hook |
|---|---|---|
| Mon/Tue (finals) | AI weekly recap | existing recap push (built) |
| Tue/Wed | Waiver report | NEW "Your waiver report is ready" |
| Thu-Sun | Start/Sit advisor | existing lineup-alert push (built) |

All three ride the existing guardrails unchanged: per-user KV rate limits,
`checkAndSpendAiBudget()` global daily cap, `withCache()` with
single-flight, `AiBudgetExhaustedError` -> 429. Copy rules apply: no emojis,
no em/en dashes (the trade prompt already instructs the model; copy that
line).

The cost story by design: recaps scale with LEAGUES (one call per league per
week, globally cached), start/sit and waivers scale with users but are
cached and rate-limited like the trade analyzer (~3k est tokens/call, about
a tenth of a cent each).

---

## 1. AI weekly recap (smallest lift — pipeline exists)

What: a short Coach-written narrative per league on /recap: biggest
blowout, closest game, top score, bench-points crime. Punchy, lightly
trash-talky, family safe.

How it works: generated ON DEMAND when the first league member opens
/recap after finals, then cached globally so everyone else in the league
(and every later view) is free. No cron change needed — the existing recap
push already drives people to /recap at the right moment.

### Build

- NEW `app/api/recap/narrative/route.ts` — POST {platform, leagueId, week}.
  - Auth via Clerk; verify the caller actually has this league connected
    (mirror the check in /api/analyze-trade) so users can only generate
    recaps for their own leagues.
  - Fetch league data via the existing `lib/leagueData.ts` fetchers (hits
    the same withCache layer the dashboard uses — no new upstream calls).
  - Build a compact matchup summary (all matchups: names, scores, records)
    and one AI call (gpt-4o-mini, json_object) returning
    {headline, blurbs: [{matchup, line}], benchCrime?}.
  - Cache: `withCache("ai:recap:v1:{platform}:{leagueId}:{week}", 8 days)`.
    Global key — first viewer pays, league shares. Budget: est 3000 tokens.
  - Rate limit: 10/hour per user (only matters for cache-miss spam across
    many leagues).
  - Guard: only generate when the week's games are FINAL (reuse the
    finals-due logic from push-dispatch); otherwise 409 and the UI shows
    nothing. Prevents half-week recaps getting cached for 8 days.
- EDIT `components/RecapContent.tsx` — after rows load, POST the narrative
  endpoint per league (sequentially, best effort); render the headline +
  per-matchup lines in a "Coach's Recap" block above the result rows.
  Silent failure = page looks exactly like today.
- OPTIONAL (later): weave the headline into the /share/week OG card
  (`app/api/og/week/route.tsx`).

Est size: ~half a day. Token cost: one 3k call per league per week.

## 2. Start/Sit advisor (highest weekly value)

What: on My Team, pick two of your players ("Compare"), get Coach's call:
{pick, lean: strong|moderate|coin flip, reasons[2-3]}. v1 is a simple
head-to-head picker; v2 (later) is "Check my lineup" that scans starters
vs bench for close calls automatically.

### Build (v1)

- NEW `app/api/analyze-startsit/route.ts` — POST {platform, leagueKey,
  teamKey, playerA, playerB}. Clone the analyze-trade skeleton:
  - Inputs the AI already gets elsewhere: roster + injury status
    (`getRosterForUser`), recent form via the week-browsing roster cache
    (same FORM_WEEKS loop as trade), bye weeks (`lib/nflSchedule.ts`),
    starting slots, and WEATHER — `lib/weather.ts` getWeatherForTeams()
    is already built and free (Open-Meteo); start/sit is where it earns
    its keep.
  - Validate both players are on the caller's roster; reject same-player.
  - Cache: `withCache("ai:startsit:v1:{hash}", 3600)` where hash =
    sha1(platform, leagueKey, week, sorted player name keys) — same
    question, same week, shared answer.
  - Rate limit 15/hour per user (the established number). Budget est 3000.
  - Prompt principles (mirror the trade prompt's style): matchup quality,
    recent form newest-first, injury designations outrank talent, weather
    only matters at extremes (wind > rain), flex eligibility, never invent
    stats. Output JSON {pick, lean, reasons[], summary}.
- NEW `components/StartSitAdvisor.tsx` — lives on the My Team league card
  next to TradeAnalyzer (same expand/collapse pattern, same verdict-card
  styling). Player picker = two dropdowns of the user's roster grouped by
  position; enable Compare when both chosen.
- EDIT `components/MyTeamContent.tsx` — mount it on each league card.
- v2 LATER: "Check my lineup" button — server finds same-position
  starter/bench pairs within ~3 projected points and runs the comparison
  only for those; ties into the existing Thursday lineup-alert push copy
  ("2 close calls in your lineup. Get Coach's call.").

Est size: 1-2 days. Token cost: ~3k per comparison, heavily cached.

## 3. Waiver report (builds on Pickups)

What: above the Trending Pickups panel on My Team, a "Coach's Waiver
Report": top 2-3 personalized pickup recommendations with who to drop and
why (byes ahead, injury holes, thin positions), across the user's leagues.

### Build

- NEW `app/api/waiver-report/route.ts` — POST, no body (acts on all
  connected leagues, like /api/pickups):
  - Inputs: the existing /api/pickups internals (trending + per-league
    availability — refactor its core into `lib/pickups.ts` so both routes
    share it), the user's roster per league, bye weeks, injury statuses.
  - One AI call: {recommendations: [{player, league, drop, reason}],
    summary}. Skip leagues where nothing trending is available.
  - Cache: `withCache("ai:waiver:v1:{userId}:{week}", 24h)` — per USER
    (it is personalized), once a day is the right cadence for waivers.
    Add a "Refresh" affordance that ignores cache at most 1/day extra.
  - Rate limit 4/day per user. Budget est 3000.
- NEW `components/WaiverReport.tsx` — card above PickupsPanel; collapsed
  one-line summary, expands to the recommendations. Hides itself when the
  report is empty (same self-hiding behavior as PickupsPanel).
- EDIT `components/MyTeamContent.tsx` — mount above PickupsPanel.
- Push (phase 2 of this feature): add `waiver: boolean` to push prefs in
  `lib/push.ts` (default ON, matching lineup/td/recap), and a Tuesday
  morning ET send in push-dispatch gated by
  `markSentOnce("push:sent:waiver:{userId}:{week}")` — copy: "Waivers
  cleared. Your report is ready." Deep link to /my-team.

Est size: ~1 day + half a day for the push.

---

## Cost summary (all three live, season traffic)

- Recaps: 1 call/league/week. 200 leagues = 200 calls/week = ~$0.06/week.
- Start/Sit: the new volume driver, but capped at 15/hr/user and cached;
  1,000 comparisons/week = ~$0.30/week.
- Waivers: <= ~5 calls/user/week. 500 actives = ~$0.75/week.
- Everything still sits under OPENAI_DAILY_TOKEN_BUDGET (2M default); these
  three at full season scale use a small fraction of it. No new env vars,
  no new services, no Vercel plan change.

## Testing gates (per feature, before deploy)

- vitest: cache-key hashing, finals-due guard (recap), roster-membership
  validation (start/sit), prefs default (waiver push).
- Manual: verify on Kyle's real Yahoo + Sleeper + ESPN leagues; confirm
  budget 429 path renders the friendly "try again tomorrow" state; lint +
  tsc + build clean; confirm no emoji/dash leaks in AI output (the prompt
  line + a strip pass like trade's slice() bounds).
