import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";
import { forceRefreshTokenForUser } from "@/lib/userTokenStore";

// --- Types for better type safety ---
interface YahooPlayer {
  name: string;
  team: string;
  position: string;
  status?: string;
  // Week-specific fantasy points (actual)
  points: number;
  actual?: number;
  // Week-specific projection if available
  projection?: number;
  // Game context
  kickoff_ms?: number | null; // epoch ms
  opponent?: string | null; // e.g., PHI
  home_away?: "@" | "vs" | null;
}

interface CachedRoster {
  ts: number;
  roster: YahooPlayer[];
  reason?: string;
  week: string | null;
}

// --- LRU Cache with size limits to prevent memory leaks ---
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstIter = this.cache.keys().next();
      if (!firstIter.done) {
        // Cast guarded value back to K
        this.cache.delete(firstIter.value as K);
      }
    }
    this.cache.set(key, value);
  }
}

// --- Memory-safe cache with cleanup and fallback ---
const ROSTER_CACHE = new LRUCache<string, CachedRoster>(500); // Reduced size for Vercel
const CACHE_TTL_MS = 30_000; // 30s – balanced between freshness and API limits
const FALLBACK_CACHE_TTL_MS = 300_000; // 5min fallback cache for errors

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest, { params }: { params: { teamKey: string } }) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  if (!userId) {
    return NextResponse.json({ ok: false, reason: 'no_user_id' }, { status: 400 });
  }

  const debug = req.nextUrl.searchParams.get('debug') === '1';
  if (debug) console.log(`[Roster] Request for ${params.teamKey}, userId: ${userId.slice(0,8)}...`);

  let { access, reason: authReason } = await getYahooAuthedForUser(userId);
  if (debug) console.log(`[Roster] Auth result for ${params.teamKey}:`, { 
    hasAccess: !!access, 
    reason: authReason,
    userId: userId.slice(0,8) + '...'
  });
  
  if (!access) {
    return NextResponse.json({ ok: false, reason: authReason || 'yahoo_auth_failed' }, { status: 401 });
  }

  const teamKey = params.teamKey;
  if (!teamKey) {
    return NextResponse.json({ ok: false, reason: 'missing_team_key' }, { status: 400 });
  }

  const urlObj = req.nextUrl;
  const requestedWeek = urlObj.searchParams.get('week'); // keep as string
  const bustCache = urlObj.searchParams.get('bust'); // Cache busting parameter
  const cacheKey = `${teamKey}:${requestedWeek || 'none'}:${bustCache || 'default'}`;

  // Serve from cache if fresh
  const cached = ROSTER_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    if (debug) console.log('[Roster] cache hit', cacheKey, { playerCount: cached.roster.length, reason: cached.reason });
    const res = NextResponse.json({
      ok: true,
      teamKey,
      week: cached.week,
      roster: cached.roster,
      players: cached.roster,
      empty: cached.roster.length === 0,
      reason: cached.reason
    });
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
  }
  
  // Check for error cache to prevent hammering failing endpoints
  const errorCacheKey = `error:${cacheKey}`;
  const errorCached = ROSTER_CACHE.get(errorCacheKey);
  if (errorCached && Date.now() - errorCached.ts < FALLBACK_CACHE_TTL_MS) {
    if (debug) console.log('[Roster] error cache hit', errorCacheKey);
    const res = NextResponse.json({
      ok: false,
      teamKey,
      reason: errorCached.reason || 'cached_error'
    }, { status: 503 });
    provisional.cookies.getAll().forEach(c => res.cookies.set(c));
    return res;
  }

  // Helper: direct Yahoo REST fetch with timeout, retry, and 401 handling
  async function yahooFetch(path: string, retries = 3): Promise<{ status: number; ok: boolean; text: string }> {
    const base = 'https://fantasysports.yahooapis.com/fantasy/v2';
    const url = `${base}/${path}?format=json`;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        
        const r = await fetch(url, { 
          headers: { 
            Authorization: `Bearer ${access}`, 
            'Accept': 'application/json',
            'User-Agent': 'FBL/1.0'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const text = await r.text();
        
  // Handle 401 - token might be expired despite passing initial check
  if (r.status === 401 && attempt === 0) {
          if (debug) console.log(`[Roster] Got 401, attempting token refresh...`);
          
          // Force refresh the token
          const newToken = await forceRefreshTokenForUser(userId);
          if (newToken && newToken !== access) {
            if (debug) console.log(`[Roster] Token refreshed, retrying request...`);
            access = newToken; // Update the access token for retry
            // Give the token store time to persist and be available for other requests
            await new Promise(resolve => setTimeout(resolve, 1000)); // Increased delay
            continue; // Retry with new token
          } else {
            if (debug) console.log(`[Roster] Token refresh failed or returned same token`);
            return { status: r.status, ok: r.ok, text };
          }
        }
        
  // If successful or it's a 401 after refresh attempt, don't retry
  if (r.ok || r.status === 401) {
          return { status: r.status, ok: r.ok, text };
        }
        
        // For other errors, retry if we have attempts left
        if (attempt < retries) {
          if (debug) console.log(`[Roster] Attempt ${attempt + 1} failed with ${r.status}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
          continue;
        }
        
        return { status: r.status, ok: r.ok, text };
      } catch (e: any) {
        if (attempt < retries && !e.name?.includes('Abort')) {
          if (debug) console.log(`[Roster] Fetch attempt ${attempt + 1} error:`, e.message, 'retrying...');
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    
    throw new Error('Max retries exceeded');
  }

  // Parse roster JSON safely
  function parseRoster(raw: any, preferPrimary = false): YahooPlayer[] {
    try {
      if (debug) console.log('[Roster] Starting parseRoster with raw data');
      
      // Based on the actual response structure: fantasy_content.team[1].roster.0.players
      const team = raw?.fantasy_content?.team;
      if (!Array.isArray(team) || team.length < 2) {
        if (debug) console.log('[Roster] Team array not found or insufficient length');
        return [];
      }
      
      const rosterData = team[1]?.roster;
      if (!rosterData) {
        if (debug) console.log('[Roster] Roster data not found in team[1]');
        return [];
      }
      
      // rosterData is an object with "0" key containing the actual roster
      const rosterObj = rosterData["0"] || rosterData[0];
      if (!rosterObj) {
        if (debug) console.log('[Roster] Roster object not found');
        return [];
      }
      
      const playersData = rosterObj.players;
      if (!playersData || typeof playersData !== 'object') {
        if (debug) console.log('[Roster] Players data not found');
        return [];
      }
      
      if (debug) console.log('[Roster] Found players data with keys:', Object.keys(playersData));
      
      const playerKeys = Object.keys(playersData).filter(k => k !== 'count');
      if (debug) console.log('[Roster] Processing', playerKeys.length, 'players');
      
  return playerKeys.map((key: string): YahooPlayer => {
        const playerEntry = playersData[key];
        if (!playerEntry || !playerEntry.player) {
          if (debug) console.log(`[Roster] No player data for key ${key}`);
          return {
            name: 'Unknown Player',
            team: '',
            position: 'BN',
            points: 0
          };
        }
        
  // playerEntry.player is an array of objects
  const playerArray = playerEntry.player;
        if (!Array.isArray(playerArray) || playerArray.length === 0) {
          if (debug) console.log(`[Roster] Invalid player array for key ${key}`);
          return {
            name: 'Unknown Player',
            team: '',
            position: 'BN',
            points: 0
          };
        }
        
  // Flatten the array of objects into a single object (best-effort)
        const playerData: any = {};
        playerArray.forEach((item: any) => {
          if (Array.isArray(item)) {
            // If item is an array, merge all objects in it
            item.forEach((subItem: any) => {
              if (typeof subItem === 'object' && subItem !== null) {
                Object.assign(playerData, subItem);
              }
            });
          } else if (typeof item === 'object' && item !== null) {
            // If item is an object, merge it directly
            Object.assign(playerData, item);
          }
        });
        
        if (debug) {
          console.log(`[Roster] Flattened player data for ${key}:`, JSON.stringify(playerData, null, 2).substring(0, 300));
        }
        
  // Helper: deep scan for selected slot from original array
        function deepSelectedSlot(arr:any[]): string | undefined {
          // Look for selected_position in any element
          const slots: string[] = [];
          for (const it of arr) {
            if (!it) continue;
            const sp = (it as any).selected_position || (it as any).selected_positions || (it as any).selected_position_list;
            if (!sp) continue;
            const pushSlot = (v:any)=>{
              const s = (typeof v === 'string') ? v : (v && typeof v === 'object') ? (v.position || v.pos) : undefined;
              if (s) slots.push(String(s));
            };
            if (Array.isArray(sp)) sp.forEach(pushSlot);
            else if (typeof sp === 'object') {
              // could be {0:{position:'QB'},1:{position:'BN'},count:2}
              Object.keys(sp).forEach(k=>{
                if (k === 'count') return;
                pushSlot((sp as any)[k]);
              });
              // also handle direct object with position
              pushSlot(sp);
            } else if (typeof sp === 'string') {
              slots.push(sp);
            }
          }
          // Prefer first non-BN slot; else last seen
          const firstNonBn = slots.find(s => String(s).toUpperCase() !== 'BN');
          return firstNonBn || (slots.length ? slots[slots.length - 1] : undefined);
        }

        // Now extract the data
        const name = playerData.name?.full || 'Unknown Player';
        const team = playerData.editorial_team_abbr || '';
        
        // Get slot from deep scan first; fallback to flattened fields
        const deepSlot = deepSelectedSlot(playerArray);
        const sp = deepSlot || playerData.selected_position || playerData.selected_positions || playerData.selected_position_list;
        let slotCandidate: any = '';
        if (sp) {
          if (Array.isArray(sp)) {
            // Prefer the first non-BN slot if available (starter slot), else fallback to the last
            const firstNonBn = sp.find((x:any)=> String(x?.position || x?.pos || x).toUpperCase() !== 'BN');
            const candidate = firstNonBn || sp[sp.length - 1];
            slotCandidate = candidate?.position || candidate?.pos || candidate;
          } else if (typeof sp === 'object') {
            slotCandidate = sp.position || sp.pos || sp[1]?.position || sp[0]?.position;
          } else if (typeof sp === 'string') {
            slotCandidate = sp;
          }
        }

        // Primary/display position from player metadata and deep scan
        function coercePrimaryPosition(pd:any, arr:any[]): string | undefined {
          const direct = pd.display_position || pd.primary_position || pd.player_primary_position || pd.position || pd.display_pos;
          if (typeof direct === 'string' && direct.trim()) return direct;
          // editorial_positions may be string like "WR" or "WR,KR" or array
          const editorial = pd.editorial_positions || pd.editorial_position || pd.position_types;
          if (typeof editorial === 'string' && editorial.trim()) return editorial.split(/[,/]/)[0].trim();
          if (Array.isArray(editorial) && editorial.length) return String(editorial[0]);
          // eligible_positions could be [{position:'WR'}, {position:'RB'}] or {0:{position:'WR'},1:{position:'RB'}}
          const elig = pd.eligible_positions || pd.player_eligible_positions || pd.eligible_position_list;
          if (Array.isArray(elig) && elig.length) {
            const first = elig.find((x:any)=> (x?.position||x?.pos) && String(x.position||x.pos).toUpperCase() !== 'BN');
            if (first) return String(first.position || first.pos);
          } else if (elig && typeof elig === 'object') {
            const keys = Object.keys(elig).filter(k=>k!=="count");
            for (const k of keys) {
              const v = (elig as any)[k];
              const pos = v?.position || v?.pos || v;
              if (pos && String(pos).toUpperCase() !== 'BN') return String(pos);
            }
          }
          // Deep scan original array for display/primary/editorial/eligible positions
          for (const it of arr) {
            if (!it || typeof it !== 'object') continue;
            const d = (it as any).display_position || (it as any).primary_position || (it as any).player_primary_position;
            if (typeof d === 'string' && d.trim()) return d;
            const ed = (it as any).editorial_positions || (it as any).position_types;
            if (typeof ed === 'string' && ed.trim()) return ed.split(/[,/]/)[0].trim();
            if (Array.isArray(ed) && ed.length) return String(ed[0]);
            const el = (it as any).eligible_positions;
            if (Array.isArray(el) && el.length) {
              const first = el.find((x:any)=> (x?.position||x?.pos) && String(x.position||x.pos).toUpperCase() !== 'BN');
              if (first) return String(first.position || first.pos);
            } else if (el && typeof el === 'object') {
              const keys = Object.keys(el).filter(k=>k!=="count");
              for (const k of keys) {
                const v = (el as any)[k];
                const pos = v?.position || v?.pos || v;
                if (pos && String(pos).toUpperCase() !== 'BN') return String(pos);
              }
            }
          }
          return undefined;
        }
  const primaryCandidate = coercePrimaryPosition(playerData, playerArray);

        // Choose: if slot is BN (bench) or empty, show primary; else show slot
  // Default: show the actual slot if available (including BN/IR). Fallback to primary if slot missing.
  let posCandidate = slotCandidate || primaryCandidate || 'BN';

  // In pre-draft, prefer primary to avoid all-BN display
  if (preferPrimary && primaryCandidate) posCandidate = primaryCandidate;

        const position = (() => {
          if (posCandidate === null || posCandidate === undefined) return 'BN';
          if (typeof posCandidate === 'string') {
            const s = posCandidate.toUpperCase();
            // Normalize common variants
            const map: Record<string,string> = {
              'D/ST': 'DEF', 'DST': 'DEF', 'DEFENSE': 'DEF', 'DE': 'DEF',
              'QB': 'QB', 'RB': 'RB', 'WR': 'WR', 'TE': 'TE', 'K': 'K',
              'FLEX': 'FLEX', 'W/R/T': 'FLEX', 'WR/RB/TE': 'FLEX', 'W/R/T/QB': 'FLEX',
            };
            return map[s] || posCandidate;
          }
          if (typeof posCandidate === 'number') return String(posCandidate);
          if (Array.isArray(posCandidate)) {
            const last = posCandidate[posCandidate.length - 1];
            if (typeof last === 'string') return last;
            if (typeof last === 'object' && last) return String((last as any).position || (last as any).pos || 'BN');
            return 'BN';
          }
          if (typeof posCandidate === 'object') {
            return String((posCandidate as any).position || (posCandidate as any).pos || 'BN');
          }
          return 'BN';
        })();

        // --- Projections & points (week aware when roster fetched with week) ---
        function totalFrom(obj:any): number {
          if (!obj) return 0;
          if (typeof obj === 'number' || typeof obj === 'string') return Number(obj) || 0;
          if (Array.isArray(obj)) {
            // Yahoo often uses arrays of small objects: [{coverage_type},{week},{total:"8.5"}]
            for (const it of obj) {
              if (it && typeof it === 'object' && ('total' in it)) return Number((it as any).total) || 0;
            }
            // sometimes the total is nested deeper
            for (const it of obj) {
              const n = Number((it as any)?.value ?? (it as any)?.points ?? NaN);
              if (Number.isFinite(n)) return n;
            }
            return 0;
          }
          if (typeof obj === 'object') {
            if ('total' in obj) return Number((obj as any).total) || 0;
            const n = Number((obj as any).points ?? (obj as any).value ?? NaN);
            return Number.isFinite(n) ? n : 0;
          }
          return 0;
        }

        const actualPts = totalFrom(playerData.player_points) || totalFrom(playerData.points);
        const projPts = totalFrom(playerData.player_projected_points) || totalFrom(playerData.projected_points);

        // --- Game info (best-effort across Yahoo shapes) ---
        function deepFind<T=any>(arr:any[], pred:(o:any)=>T|undefined): T|undefined {
          for (const it of arr) {
            if (!it) continue;
            const val = pred(it);
            if (val !== undefined) return val;
          }
          return undefined;
        }
        // kickoff timestamp (seconds or ms)
        const kickoffRaw = deepFind<any>(playerArray, (it:any)=>{
          const keys = Object.keys(it||{});
          for (const k of keys){
            const lk = k.toLowerCase();
            if (lk.includes('start_time') || lk.includes('kickoff') || lk === 'start'){
              const v:any = (it as any)[k];
              const n = Number(v);
              if (Number.isFinite(n) && n>0) return n;
              if (typeof v === 'string' && /\d{10,13}/.test(v)) return Number(v);
            }
          }
          return undefined;
        });
        const kickoff_ms = kickoffRaw ? (kickoffRaw>2_000_000_000 ? kickoffRaw : kickoffRaw*1000) : null;

        // opponent abbr
        let opponent = deepFind<string>(playerArray, (it:any)=>{
          return (
            it?.opponent_team_abbr || it?.opp_team_abbr || it?.opponent_abbr || it?.opponent ||
            it?.player_opponent?.team_abbr || undefined
          );
        }) || null;
        // BYE handling: many players include bye_weeks during their BYE
        if (!opponent) {
          const bye = deepFind<any>(playerArray, (it:any)=> it?.bye_weeks || it?.bye_week || undefined);
          if (bye) opponent = 'BYE';
        }
        // home/away
        const homeAway = (()=>{
          const away = deepFind<any>(playerArray, (it:any)=> (typeof it?.is_away === 'boolean') ? it.is_away : undefined);
          const home = away === undefined ? deepFind<any>(playerArray, (it:any)=> (typeof it?.is_home === 'boolean') ? it.is_home : undefined) : undefined;
          if (away === true) return '@' as const;
          if (away === false) return 'vs' as const;
          if (home === true) return 'vs' as const;
          if (home === false) return '@' as const;
          return null;
        })();

        const result: YahooPlayer = {
          name,
          team,
          position,
          status: playerData.status || undefined,
          points: actualPts,
          actual: actualPts,
          projection: projPts,
          kickoff_ms,
          opponent,
          home_away: homeAway
        };
        
        if (debug) console.log(`[Roster] Parsed player ${key}:`, result);
        return result;
      });
    } catch (e) {
      console.error('[Roster] Parse error:', e);
      return [];
    }
  }

  const attempts: any[] = [];
  let reason: string | undefined;
  let usedWeek: string | null = null;
  let roster: YahooPlayer[] = [];
  let draftStatus: string | undefined;

  // Strategy: try (a) with week (if provided) then (b) without week if empty or failed.
  const paths: { label: string; path: string; week: string | null }[] = [];
  if (requestedWeek) paths.push({ label: 'with_week', path: `team/${teamKey}/roster;week=${requestedWeek}`, week: requestedWeek });
  paths.push({ label: requestedWeek ? 'fallback_no_week' : 'base', path: `team/${teamKey}/roster`, week: null });

  for (const p of paths) {
    if (roster.length > 0) break; // already have data
    let fetchResult: { status: number; ok: boolean; text: string } | null = null;
    let parsedResponse: any = null;
    
    try {
      fetchResult = await yahooFetch(p.path);
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      attempts.push({ attempt: p.label, path: p.path, error: errorMsg });
      
      // On Vercel, network errors are more common, so be more permissive
      if (errorMsg.includes('timeout') || errorMsg.includes('ECONNRESET')) {
        if (debug) console.log(`[Roster] Network error for ${p.label}, continuing to next path`);
        continue;
      }
      
      // For other errors, still continue but log them
      if (debug) console.log(`[Roster] Error for ${p.label}:`, errorMsg);
      continue;
    }
    
    attempts.push({ attempt: p.label, path: p.path, status: fetchResult.status, ok: fetchResult.ok });
    
    if (fetchResult.status === 401) {
      reason = 'unauthorized';
      break;
    }
    
    if (!fetchResult.ok) {
      // For 5xx errors, cache the error briefly to prevent hammering
      if (fetchResult.status >= 500) {
        const errorCacheKey = `error:${cacheKey}`;
        ROSTER_CACHE.set(errorCacheKey, { 
          ts: Date.now(), 
          roster: [], 
          reason: 'yahoo_server_error',
          week: p.week 
        });
      }
      
      if (!reason) reason = 'yahoo_error';
      continue;
    }
    
    // Parse JSON
    try {
      parsedResponse = JSON.parse(fetchResult.text);
    } catch (e) {
      if (debug) console.log('[Roster] JSON parse error:', e);
      reason = 'parse_error';
      continue;
    }
    
  draftStatus = parsedResponse?.fantasy_content?.team?.[0]?.draft_status;
  const preferPrimary = !!draftStatus && String(draftStatus).toLowerCase() !== 'postdraft';
  roster = parseRoster(parsedResponse, preferPrimary);
    usedWeek = p.week;
    
    // Store the raw response for debugging
    if (debug) {
      attempts[attempts.length - 1].rawResponse = parsedResponse;
    }
  }

  // Cache policy: cache only successful or meaningful empty states; avoid caching transient auth/network empties
  const cacheResult = { ts: Date.now(), roster, reason, week: usedWeek };
  const shouldCache = (roster.length > 0) || (reason && reason !== 'unauthorized' && reason !== 'yahoo_error' && reason !== 'parse_error');
  if (shouldCache) {
    ROSTER_CACHE.set(cacheKey, cacheResult);
  }
  
  // If we have an error but no reason, provide a generic one
  if (!roster.length && !reason) {
    if (draftStatus && draftStatus !== 'postdraft') {
      reason = 'predraft';
    } else if (attempts.length === 0) {
      reason = 'no_attempts';
    } else {
      reason = 'empty';
    }
  }
  
  if (debug) {
    console.log('[Roster] debug', {
      userId: userId.slice(0,8) + '…',
      teamKey,
      requestedWeek,
      usedWeek,
      attempts,
      playerCount: roster.length,
      reason,
      draftStatus
    });
  }

  const res = NextResponse.json({
    ok: true,
    teamKey,
    week: usedWeek,
    roster, // keep original key for existing UI
    players: roster, // alias for future callers
    empty: roster.length === 0,
    reason,
    draftStatus: debug ? draftStatus : undefined,
    attempts: debug ? attempts : undefined,
    // Add raw response for debugging
    rawResponse: debug && attempts.length > 0 ? attempts[attempts.length - 1]?.rawResponse : undefined,
    // Add cache info for debugging
    cached: debug ? { cacheKey, cacheTtl: CACHE_TTL_MS } : undefined
  });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}