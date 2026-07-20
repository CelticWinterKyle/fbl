// ─── Single Upstash Redis client for the whole app ───────────────────────────
//
// Replaces the deprecated `@vercel/kv` v3 wrapper. That wrapper hard-codes
// `cache: "default"` on every REST request (see @vercel/kv/dist/index.js:
// "upstash/redis defaults to `no-store`, so we enforce `default`"). Under the
// Next.js App Router, `cache: "default"` opts every KV read into Next's fetch
// Data Cache, so a `kv.get()` can serve a force-cached HTTP response frozen for
// the life of the serverless instance. Different instances hold different
// frozen snapshots, which is exactly the stale-read flapping that false-paged
// the dead-cron watchdog for weeks (health:ping stuck 2026-06-11; cron:lastrun
// frozen ~22h on 07-09/10; multi-hour flapping episodes 07-16..07-19 that grew
// the heartbeat ages linearly with the wall clock — the frozen-read signature).
//
// @upstash/redis direct defaults to `cache: "no-store"`; we set it explicitly
// so the intent survives a dependency bump, and enable `readYourWrites` so this
// client never observes a read behind its own earlier writes. Same
// KV_REST_API_* env vars the Upstash/Vercel integration provisions, so no env
// changes are needed. Serialization matches @vercel/kv (both default to
// automatic JSON (de)serialization), so keys written by the old wrapper read
// back unchanged.
//
// This module is only ever imported after a `process.env.KV_REST_API_URL`
// guard (dev has no KV and uses the in-process fallbacks in the callers), so
// constructing the client at load time is safe.

import { Redis } from "@upstash/redis";

function makeClient(): Redis {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error(
      "lib/kv: KV_REST_API_URL / KV_REST_API_TOKEN are not set (import only after the KV_REST_API_URL guard)"
    );
  }
  return new Redis({
    url,
    token,
    cache: "no-store",
    readYourWrites: true,
  });
}

export const kv = makeClient();
