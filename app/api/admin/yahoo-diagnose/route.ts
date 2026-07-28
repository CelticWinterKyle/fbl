// ─── /api/admin/yahoo-diagnose ────────────────────────────────────────────────
// TEMPORARY diagnostic for the 2026-07-27 Yahoo outage. Admin-only.
//
// Every Yahoo league call has been answered "This application is not authorized
// to perform this action." since 2026-07-27T22:23:11Z, while OAuth itself stays
// healthy (fresh grants succeed, tokens refresh fine). Two explanations survive
// and they need opposite fixes:
//
//   A) app-level  - the Yahoo app cannot read Fantasy Sports at all, so even
//                   "list my leagues" is refused. Fix is at developer.yahoo.com.
//   B) league-level - the app is fine and only the two stored league keys are
//                   unreadable, which would mean the season rollover wrote keys
//                   this user cannot access. Fix is to repoint the stored keys.
//
// Asking Yahoo to list the user's own NFL leagues separates them: it needs the
// Fantasy Sports scope but names no league key. If it succeeds, it is (B), and
// its payload also tells us the CORRECT league keys to repoint to.
//
// Returns statuses and Yahoo's own error text only. No tokens, no secrets.
// Delete this route once the outage is resolved.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { readUserLeagues } from "@/lib/tokenStore/index";

export const dynamic = "force-dynamic";

const BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

async function probe(access: string, path: string) {
  try {
    const r = await fetch(`${BASE}/${path}?format=json`, {
      headers: { Authorization: `Bearer ${access}`, Accept: "application/json" },
      cache: "no-store",
    });
    const text = await r.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* non-JSON body: keep the raw excerpt below */
    }
    return {
      path,
      httpStatus: r.status,
      ok: r.ok && !parsed?.error,
      yahooError: parsed?.error?.description ?? null,
      body: parsed?.error ? null : text.slice(0, 4000),
    };
  } catch (e: any) {
    return { path, httpStatus: 0, ok: false, yahooError: `threw: ${e?.message}`, body: null };
  }
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { userId } = gate;

  const { access, reason } = await getYahooAuthedForUser(userId);
  if (!access) {
    return NextResponse.json({ ok: false, stage: "auth", reason });
  }

  const storedLeagues = await readUserLeagues(userId);

  // A: does the Fantasy Sports scope work at all, with no league key involved?
  const scopeCheck = await probe(access, "users;use_login=1/games;game_codes=nfl/leagues");

  // B: do the specific stored keys work?
  const leagueChecks = [];
  for (const key of storedLeagues) {
    leagueChecks.push(await probe(access, `league/${key}/metadata`));
  }

  const verdict = scopeCheck.ok
    ? "SCOPE OK -> app permission is fine; the stored league keys are the problem (case B)"
    : "SCOPE REFUSED -> the Yahoo app itself cannot read Fantasy Sports (case A)";

  return NextResponse.json(
    { ok: true, verdict, storedLeagues, scopeCheck, leagueChecks },
    { headers: { "Cache-Control": "no-store" } }
  );
}
