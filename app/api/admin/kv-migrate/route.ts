// ─── /api/admin/kv-migrate ────────────────────────────────────────────────────
// One-shot migration of the entire keyspace from the current KV store
// (KV_REST_API_URL/TOKEN) to a replacement store (KV_NEW_REST_API_URL/TOKEN),
// built because the original store started intermittently serving reads from
// a snapshot frozen at 2026-07-09 ~21:00 UTC (see HANDOFF: KV stuck-key
// incidents). Runs server-side so credentials never leave Vercel.
//
// Usage (admin session required):
//   GET /api/admin/kv-migrate          → dry run: inventory only, writes nothing
//   GET /api/admin/kv-migrate?apply=1  → copy everything, then spot-verify
//
// Copies strings, hashes, sets, and lists (everything the app uses) with
// millisecond TTLs preserved. Destination keys are DEL'd before writing so
// re-running is idempotent. Aborts up front if the source store is currently
// in a stale-read episode (its own alerts heartbeat reads >65 min old), so a
// copy can't capture the frozen July 9 snapshot. Delete this route (and the
// KV_NEW_* env vars) once the swap is done.

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Store = { url: string; token: string };
type CmdResult = { result?: unknown; error?: string };

async function pipeline(store: Store, cmds: (string | number)[][]): Promise<CmdResult[]> {
  const res = await fetch(`${store.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${store.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`upstash ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

async function one(store: Store, cmd: (string | number)[]): Promise<unknown> {
  const [r] = await pipeline(store, [cmd]);
  if (r.error) throw new Error(`${cmd[0]} ${cmd[1] ?? ""}: ${r.error}`);
  return r.result;
}

async function scanAllKeys(store: Store): Promise<string[]> {
  const keys = new Set<string>();
  let cursor = "0";
  do {
    const res = (await one(store, ["SCAN", cursor, "COUNT", 500])) as [string, string[]];
    cursor = res[0];
    for (const k of res[1]) keys.add(k);
  } while (cursor !== "0");
  return [...keys];
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const apply = req.nextUrl.searchParams.get("apply") === "1";
  const started = Date.now();

  const src: Store = {
    url: process.env.KV_REST_API_URL ?? "",
    token: process.env.KV_REST_API_TOKEN ?? "",
  };
  const dst: Store = {
    url: process.env.KV_NEW_REST_API_URL ?? "",
    token: process.env.KV_NEW_REST_API_TOKEN ?? "",
  };
  if (!src.url || !src.token) {
    return NextResponse.json({ ok: false, error: "source KV env vars missing" }, { status: 500 });
  }
  if (!dst.url || !dst.token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "KV_NEW_REST_API_URL / KV_NEW_REST_API_TOKEN not set. Connect the replacement store to this project with env prefix KV_NEW, then redeploy.",
      },
      { status: 400 }
    );
  }
  if (src.url === dst.url) {
    return NextResponse.json(
      { ok: false, error: "source and destination are the same store; env swap already done?" },
      { status: 400 }
    );
  }

  // Stale-read guard: if the source is mid-episode, every GET below could
  // return the frozen July 9 snapshot and we would faithfully copy garbage.
  // The alerts cron rewrites its heartbeat every 30 min, so a fresh read of
  // it proves the source is currently serving current data.
  const rawBeat = (await one(src, ["GET", "cron:lastrun:alerts"])) as string | null;
  if (rawBeat) {
    const beatAgeMin = Math.round((Date.now() - JSON.parse(rawBeat).ts) / 60000);
    if (beatAgeMin > 65) {
      return NextResponse.json(
        {
          ok: false,
          error: `source reads are stale right now (alerts heartbeat reads ${beatAgeMin} min old); retry when the store is in a healthy phase`,
        },
        { status: 503 }
      );
    }
  }

  const keys = await scanAllKeys(src);
  const byType: Record<string, number> = {};
  const errors: string[] = [];
  let copied = 0;
  let withTtl = 0;

  const BATCH = 50;
  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    const meta = await pipeline(
      src,
      batch.flatMap((k) => [["TYPE", k], ["PTTL", k]] as (string | number)[][])
    );

    for (let j = 0; j < batch.length; j++) {
      const key = batch[j];
      const type = String(meta[j * 2].result);
      const pttl = Number(meta[j * 2 + 1].result); // -1 no ttl, -2 gone
      byType[type] = (byType[type] ?? 0) + 1;
      if (pttl === -2) continue;
      if (!apply) continue;

      try {
        const writes: (string | number)[][] = [["DEL", key]];
        if (type === "string") {
          const v = (await one(src, ["GET", key])) as string | null;
          if (v === null) continue;
          writes.push(["SET", key, v]);
        } else if (type === "hash") {
          const flat = (await one(src, ["HGETALL", key])) as string[];
          if (!flat.length) continue;
          writes.push(["HSET", key, ...flat]);
        } else if (type === "set") {
          const members = (await one(src, ["SMEMBERS", key])) as string[];
          if (!members.length) continue;
          writes.push(["SADD", key, ...members]);
        } else if (type === "list") {
          const items = (await one(src, ["LRANGE", key, 0, -1])) as string[];
          if (!items.length) continue;
          writes.push(["RPUSH", key, ...items]);
        } else {
          errors.push(`${key}: unhandled type ${type}`);
          continue;
        }
        if (pttl > 0) {
          writes.push(["PEXPIRE", key, pttl]);
          withTtl++;
        }
        const results = await pipeline(dst, writes);
        const failed = results.find((r) => r.error);
        if (failed) throw new Error(failed.error);
        copied++;
      } catch (e: any) {
        errors.push(`${key}: ${String(e?.message).slice(0, 120)}`);
      }
    }
  }

  // Spot-verify: source and destination agree on a sample of string keys.
  let verified: { key: string; match: boolean }[] = [];
  if (apply) {
    const sample = keys.filter((k) => k.startsWith("tokens:") || k.startsWith("cron:")).slice(0, 10);
    verified = await Promise.all(
      sample.map(async (key) => {
        const [a, b] = await Promise.all([one(src, ["GET", key]), one(dst, ["GET", key])]);
        return { key, match: JSON.stringify(a) === JSON.stringify(b) };
      })
    );
  }

  const [srcSize, dstSize] = await Promise.all([
    one(src, ["DBSIZE"]),
    one(dst, ["DBSIZE"]),
  ]);

  return NextResponse.json({
    ok: errors.length === 0,
    dryRun: !apply,
    totalKeys: keys.length,
    byType,
    copied,
    withTtl,
    srcDbSize: srcSize,
    dstDbSize: dstSize,
    verified,
    errors: errors.slice(0, 50),
    durationMs: Date.now() - started,
    next: apply
      ? "Point KV_REST_API_URL / KV_REST_API_TOKEN (and KV_URL / KV_REDIS_URL / KV_REST_API_READ_ONLY_TOKEN) at the new store, redeploy, then delete this route and the KV_NEW_* vars."
      : "Dry run only. Re-run with ?apply=1 to copy.",
  });
}
