// ─── Global daily OpenAI token budget ─────────────────────────────────────────
// Caps total estimated OpenAI spend per UTC day across ALL users, on top of the
// per-user rate limits the AI routes already enforce. Uses KV in production;
// when KV is absent (dev) the budget always allows. KV errors fail open (an
// outage should degrade to "no cap", not kill the AI features) but are logged.

const DEFAULT_DAILY_TOKEN_BUDGET = 2_000_000;

/** Thrown inside cache fetchers so routes can map budget exhaustion to a 429. */
export class AiBudgetExhaustedError extends Error {
  constructor() {
    super("ai_budget_exhausted");
    this.name = "AiBudgetExhaustedError";
  }
}

/**
 * Atomically add estTokens to today's global spend counter and report whether
 * the call is still within budget. Key: openai:spend:{YYYY-MM-DD} (UTC),
 * expired after 48h so stale counters clean themselves up.
 */
export async function checkAndSpendAiBudget(
  estTokens: number
): Promise<{ allowed: boolean; spent: number; limit: number }> {
  const envLimit = Number(process.env.OPENAI_DAILY_TOKEN_BUDGET);
  const limit = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_DAILY_TOKEN_BUDGET;

  if (!process.env.KV_REST_API_URL) {
    return { allowed: true, spent: 0, limit }; // dev: no KV, no cap
  }

  try {
    const { kv } = await import("@/lib/kv");
    const day = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
    const key = `openai:spend:${day}`;
    const spent = (await kv.incrby(key, estTokens)) as number;
    if (spent === estTokens) await kv.expire(key, 172800); // first increment today: 48h TTL
    return { allowed: spent <= limit, spent, limit };
  } catch (e) {
    console.error("[aiBudget] KV error, failing open:", e);
    return { allowed: true, spent: 0, limit };
  }
}
