# Sportsbook Affiliate Plan

Status 2026-07-16: the 2026-06-15 DraftKings Google Form interest survey got
NO response in a month (industry consensus: DK ignores applications it passes
on, so treat it as dead). The FanDuel fallback application was never actually
submitted (the plan said "if no DK response within ~2 weeks" and the trigger
slipped). Current actions:
- Apply to FanDuel Partners at affiliates.fanduel.com (selective review, 1-5
  business days; expect an FTDs-per-month question). CPA $100-400 sportsbook
  or rev share up to 35% NGR / 730 days.
- Re-apply to DraftKings through the real DK Partners application at
  draftkings.com/affiliate-offers (not the interest survey).
- Application pitch for both: see "Application pitch" below.

## Decision

DraftKings Sportsbook is the first-choice affiliate partner. FanDuel is the
fallback if DK declines or is slow. Apply to FanDuel in parallel if no DK
response within ~2 weeks. (2026-07-16: now applying to both in parallel;
first program to approve gets the Phase B integration, single-partner rule
unchanged.)

## Why DraftKings

- Widest state coverage (24+ states)
- Largest affiliate program, strongest brand overlap with fantasy users
- Player props are a major DK product, maps directly to the props content
  already built in the Odds tab
- CPA model: $100-300 per funded sportsbook bettor

## Application pitch (what was submitted)

- Contextual placement inside a real fantasy football app, not a content blog
- Affiliate links embedded alongside player prop data personalized to each
  user's actual fantasy roster (high-intent placement)
- Responsible gambling guardrails: 21+ age gate, 1-800-GAMBLER footer,
  odds content contained to Odds tab only, no push notifications about odds
- Early growth stage, organic acquisition via Chrome Web Store + word of mouth

## Technical build needed (scope when approved)

1. 21+ age gate on first Odds tab open (KV flag per user)
2. Geo-gating: Vercel request.geo to show/hide affiliate links by state
3. Affiliate link placements in OddsContent (game lines + player props)
4. Responsible gambling footer on all odds surfaces (1-800-GAMBLER)
5. Disclosure labels ("Paid partnership" on affiliate placements)
6. Privacy/terms updates for affiliate tracking disclosure
7. Conversion tracking (subId attribution in partner links, event logging)

## State licensing notes

- Most states do NOT require a separate affiliate license for CPA-model
  promotion
- New York is the main exception (requires gambling advertising license)
- Geo-gate NY (and any other restricted states) until sorted
- Revisit if DraftKings requires specific state registrations during onboarding

## Bright lines (unchanged from docs/ODDS_MONETIZATION_PLAN.md)

All six bright lines still apply. No bet CTAs outside the Odds tab, no odds
in push notifications, no deposit-bonus interstitials, no forced navigation
to the Odds tab.
