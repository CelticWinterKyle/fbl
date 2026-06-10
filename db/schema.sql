-- League Blitz Postgres schema (Neon / Supabase / Vercel Postgres).
-- KV remains the cache + encrypted-credential store; Postgres is the durable,
-- queryable layer. This schema is the prerequisite for League HQ (payments),
-- cross-user analytics, and connection-health reporting.
--
-- Apply with: psql "$POSTGRES_URL" -f db/schema.sql

create table if not exists users (
  id            text primary key,            -- Clerk userId
  email         text,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz                  -- soft delete; KV wipe happens via webhook
);

-- One row per (user, platform, league). Credentials stay encrypted in KV;
-- this table holds metadata only, so it is safe to query freely.
create table if not exists connections (
  id            bigint generated always as identity primary key,
  user_id       text not null references users(id) on delete cascade,
  platform      text not null check (platform in ('yahoo', 'sleeper', 'espn')),
  league_id     text not null,
  league_name   text,
  season        int,
  is_commissioner boolean not null default false,
  created_at    timestamptz not null default now(),
  removed_at    timestamptz,
  unique (user_id, platform, league_id)
);

create index if not exists connections_platform_league
  on connections (platform, league_id) where removed_at is null;

-- Written by the espn-keepalive cron (mirrors the KV espnhealth:* records).
create table if not exists connection_health (
  connection_id bigint not null references connections(id) on delete cascade,
  checked_at    timestamptz not null default now(),
  ok            boolean not null,
  error         text,
  primary key (connection_id, checked_at)
);

-- Lightweight product analytics (page loads, analyses run, leagues connected).
create table if not exists events (
  id            bigint generated always as identity primary key,
  user_id       text,
  kind          text not null,
  meta          jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists events_kind_time on events (kind, created_at);

-- ─── League HQ (dues) — money tables, designed up front, used later ──────────
-- Every money movement is a ledger row; balances are always derived, never
-- stored. Stripe webhook deliveries are recorded for idempotency.

create table if not exists league_pots (
  id            bigint generated always as identity primary key,
  platform      text not null,
  league_id     text not null,
  season        int not null,
  commissioner_user_id text not null references users(id),
  buy_in_cents  int not null check (buy_in_cents >= 0),
  currency      text not null default 'usd',
  status        text not null default 'open' check (status in ('open', 'locked', 'paid_out', 'cancelled')),
  created_at    timestamptz not null default now(),
  unique (platform, league_id, season)
);

create table if not exists ledger_entries (
  id            bigint generated always as identity primary key,
  pot_id        bigint not null references league_pots(id),
  user_id       text references users(id),
  kind          text not null check (kind in ('buy_in', 'refund', 'payout', 'service_fee')),
  amount_cents  int not null,                -- signed: into pot positive, out negative
  stripe_payment_intent text,
  created_at    timestamptz not null default now()
);

create index if not exists ledger_pot on ledger_entries (pot_id);

create table if not exists stripe_webhook_events (
  stripe_event_id text primary key,          -- idempotency: insert-or-skip
  received_at   timestamptz not null default now(),
  payload       jsonb not null
);
