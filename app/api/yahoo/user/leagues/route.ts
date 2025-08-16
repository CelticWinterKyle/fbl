import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { getOrCreateUserId } from "@/lib/userSession";

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get('debug') === '1';
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  const { yf, reason } = await getYahooAuthedForUser(userId);
  if (!yf) {
    const res = NextResponse.json({ ok:false, error: reason || 'not_authed' });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  }
  const out:any[] = [];
  try {
    // Wrap in promise to support either callback or promise style from lib
    const gRes = await new Promise<any>(resolve => {
      try {
        const maybe = yf.user.games((err: any, data: any) => {
          if (data) return resolve(data);
          if (err) return resolve({ error: err });
        });
        if (maybe && typeof maybe.then === 'function') {
          maybe.then(resolve).catch((e: any)=>resolve({ error:e }));
        } else if (maybe && maybe.games) {
          resolve(maybe);
        } else {
          // if lib returns nothing we resolve later via callback
          setTimeout(()=>resolve(maybe), 400);
        }
      } catch(e:any) { resolve({ error:e }); }
    });
    if (gRes?.error) throw gRes.error;
  let games = (gRes?.games ?? gRes?.user?.games ?? []).map((g:any)=>g.game || g);
  const debugInfo: any = debug ? { initialGamesArrayLength: games.length, gResSample: JSON.stringify(gRes)?.slice(0,2000) } : undefined;
    // Fallback: direct REST call if empty
    if (!games.length) {
      const token = (yf as any)._accessToken || (yf as any).token || null;
      if (token) {
        const rawUsers = await fetch('https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;format=json', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
        }).then(r=>r.json()).catch(e=>({ _rawError: e?.message }));
    if (debug && debugInfo) debugInfo.rawUsersSample = JSON.stringify(rawUsers)?.slice(0,2000);
        const maybeGames = rawUsers?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game;
        if (Array.isArray(maybeGames)) {
          games = maybeGames.map((entry:any)=> entry?.[0] || entry).filter(Boolean);
        }
      }
    }

    // Fallback path: derive leagues from user teams if leagues arrays empty later.
    let teamsData: any = null;
    const collectTeams = async () => {
      if (teamsData) return teamsData;
      try {
        // Try sdk style
        teamsData = await new Promise<any>(resolve => {
          try {
            const maybe = (yf as any).user.teams((err: any, data: any) => {
              if (data) return resolve(data);
              if (err) return resolve({ _err: err });
            });
            if (maybe && typeof maybe.then === 'function') {
              maybe.then(resolve).catch((e:any)=>resolve({ _err:e }));
            }
          } catch(e:any) { resolve({ _err:e }); }
        });
        if (teamsData?._err) teamsData = null;
        if (!teamsData) {
          const token = (yf as any)._accessToken || (yf as any).token || null;
          if (token) {
            const rawTeams = await fetch('https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/teams;format=json', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }).then(r=>r.json()).catch(()=>null);
            teamsData = rawTeams;
            if (debug && debugInfo) debugInfo.rawTeamsSample = JSON.stringify(rawTeams)?.slice(0,2000);
          }
        }
      } catch {}
      return teamsData;
    };
    if (games.length) {
      for (const g of games) {
        const key = g?.game_key || g?.code || g?.code_and_year || g?.key;
        if (!key) continue;
        let leagues = [] as any[];
        try {
          const lRes = await yf.user.leagues(key).catch(()=>null);
          leagues = (lRes?.leagues ?? lRes?.user?.leagues ?? []).map((l:any)=>l.league || l);
        } catch {}
        if (!leagues.length) {
          const token = (yf as any)._accessToken || (yf as any).token || null;
            if (token) {
              const rawLeagues = await fetch(`https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=${key}/leagues;format=json`, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
              }).then(r=>r.json()).catch(()=>null);
              const container = rawLeagues?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues?.[0]?.league;
              if (Array.isArray(container)) {
                leagues = container.map((entry:any)=> entry?.[0] || entry).filter(Boolean);
              }
            }
        }
        if (!leagues.length) {
          // Attempt to infer from teams
            const t = await collectTeams();
            try {
              const teamArr = t?.fantasy_content?.users?.[0]?.user?.[1]?.teams?.[0]?.team;
              if (Array.isArray(teamArr)) {
                const derived: Record<string, any> = {};
                for (const entry of teamArr) {
                  const teamObj = entry?.[0] || entry;
                  const teamKey = teamObj?.team_key as string | undefined; // e.g. 461.l.12345.t.1
                  if (!teamKey) continue;
                  const leagueKey = teamKey.split('.t.')[0];
                  const gk = leagueKey.split('.l.')[0];
                  if (gk !== key) continue;
                  if (!derived[leagueKey]) {
                    derived[leagueKey] = { league_key: leagueKey, name: teamObj?.name || teamObj?.team_name || 'League '+leagueKey, league_id: leagueKey.split('.l.')[1] };
                  }
                }
                leagues = Object.values(derived);
              }
            } catch {}
        }
        out.push({
          game_key: g?.game_key,
          code: g?.code,
          name: g?.name,
          season: g?.season,
          leagues: leagues.map((l:any)=>({
            name: l?.name,
            league_id: l?.league_id || (l?.league_key ? String(l.league_key).split('.l.')[1] : null),
            league_key: l?.league_key,
          }))
        });
      }
    }
  const res = NextResponse.json({ ok:true, games: out, debug: debug ? debugInfo : undefined });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  } catch (e:any) {
  console.error('[user/leagues] failure', e);
  const res = NextResponse.json({ ok:false, error: e?.message || 'failed', stack: process.env.NODE_ENV !== 'production' ? e?.stack : undefined }, { status:500 });
    provisional.cookies.getAll().forEach(c=>res.cookies.set(c));
    return res;
  }
}
