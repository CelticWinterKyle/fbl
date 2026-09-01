import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRosterForUser } from "@/lib/rosterData";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(
  req: NextRequest,
  { params }: { params: { teamKey: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, reason: "no_user_id" }, { status: 400 });
  }

  // debug=variants: try several raw Yahoo resource paths we haven't tested
  // yet for a per-player weekly projection (singular player resource,
  // is_projected on the roster-scoped path instead of the global batched
  // path, and a fully chained scoreboard->matchups->teams->roster->players
  // request). Authed, caller's own team only. Temporary — delete once
  // answered.
  if (req.nextUrl.searchParams.get("debug") === "variants") {
    const platform = req.nextUrl.searchParams.get("platform");
    const week = req.nextUrl.searchParams.get("week");
    const leagueKey = req.nextUrl.searchParams.get("leagueKey");
    const playerKey = req.nextUrl.searchParams.get("playerKey");
    if (platform !== "yahoo" || !week || !leagueKey || !playerKey) {
      return NextResponse.json({ ok: false, error: "debug=variants requires platform=yahoo&week=N&leagueKey=&playerKey=" }, { status: 400 });
    }
    const { getYahooAuthedForUser } = await import("@/lib/yahoo");
    const { yahooFetch } = await import("@/lib/adapters/yahoo");
    const guard = await getYahooAuthedForUser(userId);
    if (!guard.access) return NextResponse.json({ ok: false, error: guard.reason });

    // Deep-search any key containing "proj" anywhere in the parsed JSON,
    // reporting its path and value so a nonzero hit is easy to spot.
    function findProjLike(obj: any, path = "", hits: { path: string; value: any }[] = [], depth = 0): { path: string; value: any }[] {
      if (depth > 8 || obj == null) return hits;
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => findProjLike(v, `${path}[${i}]`, hits, depth + 1));
      } else if (typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          const p = path ? `${path}.${k}` : k;
          if (/proj/i.test(k)) hits.push({ path: p, value: obj[k] });
          findProjLike(obj[k], p, hits, depth + 1);
        }
      }
      return hits;
    }

    const variants: Record<string, string> = {
      singularPlayerPlain: `player/${playerKey}/stats;type=week;week=${week}`,
      singularPlayerProjected: `player/${playerKey}/stats;type=week;week=${week};is_projected=1`,
      rosterScopedProjected: `team/${params.teamKey}/roster;week=${week}/players/stats;type=week;week=${week};is_projected=1`,
      rosterScopedOutProjections: `team/${params.teamKey}/roster;week=${week}/players/stats;type=week;week=${week};out=projections`,
      scoreboardChained: `league/${leagueKey}/scoreboard;week=${week}/matchups/teams/roster/players/stats;type=week;week=${week};is_projected=1`,
    };

    const results: Record<string, any> = {};
    for (const [label, path] of Object.entries(variants)) {
      try {
        const resp = await yahooFetch(guard.access, path);
        let json: any = null;
        try { json = JSON.parse(resp.text); } catch {}
        results[label] = {
          status: resp.status,
          projHits: json ? findProjLike(json).slice(0, 10) : null,
          parseError: json ? undefined : resp.text.slice(0, 300),
        };
      } catch (e: any) {
        results[label] = { error: String(e?.message || e) };
      }
    }

    return NextResponse.json({ ok: true, results });
  }

  const result = await getRosterForUser(userId, {
    platform: req.nextUrl.searchParams.get("platform"),
    teamKey: params.teamKey,
    leagueKey: req.nextUrl.searchParams.get("leagueKey") ?? undefined,
    requestedWeek: req.nextUrl.searchParams.get("week"),
  });

  if (!result.ok) {
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  }

  const res = NextResponse.json(result);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return res;
}
