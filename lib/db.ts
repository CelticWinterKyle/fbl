// ─── Postgres data layer (optional until provisioned) ────────────────────────
// Activates when POSTGRES_URL is set (Neon / Supabase / Vercel Postgres via the
// Marketplace). Until then every helper is a silent no-op, so the app runs
// unchanged on pure KV. Apply db/schema.sql once after provisioning.
//
// Scope discipline: KV keeps cache + encrypted credentials; Postgres holds
// durable, queryable metadata (users, connection metadata, health, events) and
// is the required substrate for League HQ money tables.

export function isDbAvailable(): boolean {
  return !!process.env.POSTGRES_URL;
}

async function sql(query: string, params: unknown[] = []): Promise<unknown[] | null> {
  if (!isDbAvailable()) return null;
  try {
    // Lazy import keeps the dependency out of the bundle when unused.
    const { neon } = await import("@neondatabase/serverless");
    const client = neon(process.env.POSTGRES_URL!);
    return await client.query(query, params as any[]);
  } catch (e) {
    console.error("[db] query failed:", (e as any)?.message);
    return null;
  }
}

/** Upsert the user row (call from auth-touching paths; cheap and idempotent). */
export async function ensureUser(userId: string, email?: string): Promise<void> {
  await sql(
    `insert into users (id, email) values ($1, $2)
     on conflict (id) do update set email = coalesce(excluded.email, users.email)`,
    [userId, email ?? null]
  );
}

/** Record connection metadata (no credentials). Mirrors the KV registry. */
export async function recordConnection(opts: {
  userId: string;
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  leagueName?: string;
  season?: number;
  isCommissioner?: boolean;
}): Promise<void> {
  await ensureUser(opts.userId);
  await sql(
    `insert into connections (user_id, platform, league_id, league_name, season, is_commissioner)
     values ($1, $2, $3, $4, $5, coalesce($6, false))
     on conflict (user_id, platform, league_id) do update
       set removed_at = null,
           league_name = coalesce(excluded.league_name, connections.league_name),
           season = coalesce(excluded.season, connections.season),
           is_commissioner = coalesce($6, connections.is_commissioner)`,
    [opts.userId, opts.platform, opts.leagueId, opts.leagueName ?? null, opts.season ?? null, opts.isCommissioner ?? null]
  );
}

export async function markConnectionRemoved(
  userId: string,
  platform: string,
  leagueId: string
): Promise<void> {
  await sql(
    `update connections set removed_at = now()
     where user_id = $1 and platform = $2 and league_id = $3`,
    [userId, platform, leagueId]
  );
}

/** Lightweight product analytics. Fire-and-forget from call sites. */
export async function recordEvent(
  kind: string,
  userId?: string,
  meta?: Record<string, unknown>
): Promise<void> {
  await sql(`insert into events (user_id, kind, meta) values ($1, $2, $3)`, [
    userId ?? null,
    kind,
    meta ? JSON.stringify(meta) : null,
  ]);
}
