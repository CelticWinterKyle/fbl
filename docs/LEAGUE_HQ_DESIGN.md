# League HQ (Commissioner Dues) — Design Doc

Status: DESIGN ONLY. The revenue path per HANDOFF.md. Do not start until Postgres
is provisioned (db/schema.sql already defines the money tables) and the season
has proven retention.

## What it is

The commissioner collects league buy-ins through League Blitz; we take a small
service fee on money already changing hands (LeagueSafe model). The commissioner
is the buyer; the league members are the payers; the product gets stickier
because the whole league's money runs through it.

## Prerequisites (all in place or scaffolded)

- Postgres with `league_pots`, `ledger_entries`, `stripe_webhook_events`
  (db/schema.sql). Balances are ALWAYS derived from the ledger, never stored.
- Commissioner identification: the connect-page Commissioner toggle
  (`commish:{platform}:{leagueId}:{userId}` in KV) seeds targeting.
- Account deletion flow (Clerk webhook) must be extended to handle users with
  open pots: block deletion or auto-refund first.

## Payments architecture

- **Stripe Connect (destination charges)**: members pay a Checkout Session;
  funds settle to the commissioner's connected account minus our
  `application_fee_amount`. We never hold the pot ourselves: no money
  transmitter exposure. Validate this against current Stripe Connect docs and a
  lawyer before launch.
- Fee: flat per-league (e.g. $20/season) or 5% capped, decided at pricing time.
- Webhooks: `checkout.session.completed`, `charge.refunded`,
  `account.updated`. Every event inserts into `stripe_webhook_events` first
  (PK = stripe event id) for idempotency; processing reads from there.

## Flows

1. **Commissioner setup**: Commissioner toggle on → "Set up league dues" CTA →
   Stripe Connect onboarding (Express) → create `league_pots` row (platform,
   leagueId, season, buy_in_cents).
2. **Member pay**: shareable pay link `/league/{potId}/pay` (public page, Clerk
   sign-in optional but encouraged for receipts) → Checkout → webhook writes
   `buy_in` ledger row.
3. **Tracking**: commissioner dashboard card: paid/unpaid roster, derived pot
   total, nudge button (copyable message, NOT automated email at v1).
4. **Payout**: funds already in the commissioner's Stripe account; "payout" in
   v1 is informational (ledger `payout` rows recorded manually by the commish
   marking winners). v2 can do member-level payout links.

## Out of scope for v1

Escrow/holding the pot, automated winner payouts, refund arbitration,
multi-currency, recurring billing. Each adds compliance weight; revisit only if
v1 sees real usage.

## Build estimate

Stripe Connect onboarding + checkout + webhooks + ledger: ~4-5 days.
Commissioner UI (setup wizard, paid/unpaid tracking): ~3 days.
Legal/ToS updates and Stripe review: calendar time, start early.
