# Web Push Notifications — Design Doc

Status: DESIGN ONLY. The number-one retention feature in the category and the
one credible future Pro anchor ("your players, every league, one notification
stream" per HANDOFF.md). Build before week 1 if possible.

## Foundation already in place

- PWA manifest + icons (public/) — installed-app context for push on Android
  and iOS 16.4+ (iOS requires the app be added to the home screen).
- Cron tier (vercel.json) — server-side event detection can piggyback on
  `refresh-leagues` (every 10 min in game windows) or a dedicated 1-min cron.
- Roster membership logic — `FeedContent`/`lib/nflPlays.ts` already map ESPN
  scoring plays to the user's rostered players across leagues.

## Architecture

1. **Subscribe**: service worker (public/sw.js) + `PushManager.subscribe` with
   a VAPID public key (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`). Store subscriptions in
   KV `push:subs:{userId}` (array; one per device). Settings UI: a simple
   notifications card on /connect or a new /settings page with per-type
   toggles stored in `push:prefs:{userId}`.
2. **Detect**: extend the game-window cron: fetch scoring plays once (already
   globally cached), diff against `push:lastplay:{gameId}` cursors, build
   per-user notification candidates from roster membership (the FeedContent
   logic moved server-side into lib/).
3. **Send**: `web-push` npm package with VAPID keys (generate once:
   `npx web-push generate-vapid-keys`; private key = `VAPID_PRIVATE_KEY` env).
   Batch sends; drop subscriptions on 404/410 responses.
4. **Notification types (v1)**: your player scored (TD only by default),
   close game in the 4th quarter, final score per league. Default: TD + final
   only, to avoid notification fatigue.

## Cost / scale notes

Push sends are free (browser push services). The cron diff work is one ESPN
plays fetch per tick (already cached) plus KV reads proportional to
subscribed users; fine to thousands of users.

## Build estimate

Service worker + subscribe + settings: ~1 day. Server-side detection from the
existing feed logic: ~2 days. Send pipeline + cleanup: ~1 day. Total ~4 days.
