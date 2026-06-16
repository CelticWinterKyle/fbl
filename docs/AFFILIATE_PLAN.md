# Sportsbook Affiliate Plan

Status: APPLICATION SUBMITTED to DraftKings 2026-06-15 via
draftkings.com/affiliates (Google Form interest survey). Awaiting response.

## Decision

DraftKings Sportsbook is the first-choice affiliate partner. FanDuel is the
fallback if DK declines or is slow. Apply to FanDuel in parallel if no DK
response within ~2 weeks.

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
