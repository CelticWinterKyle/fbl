import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserId } from "@/lib/userSession";
import { getYahooAuthedForUser } from "@/lib/yahoo";

// --- Types for better type safety ---
interface YahooPlayer {
  name: string;
  team: string;
  position: string;
  status?: string;
  points: number;
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

// --- Memory-safe cache with cleanup ---
const ROSTER_CACHE = new LRUCache<string, CachedRoster>(1000);
const CACHE_TTL_MS = 15_000; // 15s – short-lived to reduce burst traffic while keeping near-real-time

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest, { params }: { params: { teamKey: string } }) {
  const provisional = NextResponse.next();
  const { userId } = getOrCreateUserId(req, provisional);
  if (!userId) {
    return NextResponse.json({ ok: false, reason: 'no_user_id' }, { status: 400 });
  }

  const { access, reason: authReason } = await getYahooAuthedForUser(userId);
  if (!access) {
    return NextResponse.json({ ok: false, reason: authReason || 'yahoo_auth_failed' }, { status: 401 });
  }

  const teamKey = params.teamKey;
  if (!teamKey) {
    return NextResponse.json({ ok: false, reason: 'missing_team_key' }, { status: 400 });
  }

  const urlObj = req.nextUrl;
  const debug = urlObj.searchParams.get('debug') === '1';
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

  // Helper: direct Yahoo REST fetch
  async function yahooFetch(path: string) {
    const base = 'https://fantasysports.yahooapis.com/fantasy/v2';
    const url = `${base}/${path}?format=json`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access}`, 'Accept': 'application/json' } });
    const text = await r.text();
    return { status: r.status, ok: r.ok, text };
  }

  // Parse roster JSON safely
  function parseRoster(raw: any): YahooPlayer[] {
    try {
      console.log('[Roster] Starting parseRoster with raw data');
      
      // Based on the actual response structure: fantasy_content.team[1].roster.0.players
      const team = raw?.fantasy_content?.team;
      if (!Array.isArray(team) || team.length < 2) {
        console.log('[Roster] Team array not found or insufficient length');
        return [];
      }
      
      const rosterData = team[1]?.roster;
      if (!rosterData) {
        console.log('[Roster] Roster data not found in team[1]');
        return [];
      }
      
      // rosterData is an object with "0" key containing the actual roster
      const rosterObj = rosterData["0"] || rosterData[0];
      if (!rosterObj) {
        console.log('[Roster] Roster object not found');
        return [];
      }
      
      const playersData = rosterObj.players;
      if (!playersData || typeof playersData !== 'object') {
        console.log('[Roster] Players data not found');
        return [];
      }
      
      console.log('[Roster] Found players data with keys:', Object.keys(playersData));
      
      const playerKeys = Object.keys(playersData).filter(k => k !== 'count');
      console.log('[Roster] Processing', playerKeys.length, 'players');
      
      return playerKeys.map((key: string): YahooPlayer => {
        const playerEntry = playersData[key];
        if (!playerEntry || !playerEntry.player) {
          console.log(`[Roster] No player data for key ${key}`);
          return {
            name: 'Unknown Player',
            team: '',
            position: 'BN',
            points: 0
          };
        }
        
        // playerEntry.player is an array of objects, need to flatten first
        const playerArray = playerEntry.player;
        if (!Array.isArray(playerArray) || playerArray.length === 0) {
          console.log(`[Roster] Invalid player array for key ${key}`);
          return {
            name: 'Unknown Player',
            team: '',
            position: 'BN',
            points: 0
          };
        }
        
        // Flatten the array of objects into a single object
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
        
        console.log(`[Roster] Flattened player data for ${key}:`, JSON.stringify(playerData, null, 2).substring(0, 300));
        
        // Now extract the data from the flattened object
        const name = playerData.name?.full || 'Unknown Player';
        const team = playerData.editorial_team_abbr || '';
        
        // Get position from selected_position or display_position
        const position = playerData.selected_position?.[1]?.position || 
                        playerData.position || 
                        playerData.display_position || 'BN';
        
        // Get points if available
        const points = Number(playerData.player_points?.total || 0);
        
        const result = {
          name,
          team,
          position,
          status: playerData.status || undefined,
          points
        };
        
        console.log(`[Roster] Parsed player ${key}:`, result);
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
      attempts.push({ attempt: p.label, path: p.path, error: e?.message || String(e) });
      continue;
    }
    attempts.push({ attempt: p.label, path: p.path, status: fetchResult.status, ok: fetchResult.ok });
    if (fetchResult.status === 401) {
      reason = 'unauthorized';
      break;
    }
    if (!fetchResult.ok) {
      // non-401 failure – record and continue to next (if any)
      if (!reason) reason = 'yahoo_error';
      continue;
    }
    // Parse JSON
    try {
      parsedResponse = JSON.parse(fetchResult.text);
    } catch (e) {
      reason = 'parse_error';
      continue;
    }
    draftStatus = parsedResponse?.fantasy_content?.team?.[0]?.draft_status;
    roster = parseRoster(parsedResponse);
    usedWeek = p.week;
    
    // Store the raw response for debugging
    if (debug) {
      attempts[attempts.length - 1].rawResponse = parsedResponse;
    }
  }

  if (!roster.length && !reason) {
    if (draftStatus && draftStatus !== 'postdraft') reason = 'predraft'; else reason = 'empty';
  }
  if (!roster.length && !draftStatus && !reason) reason = 'roster_fetch_failed';

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

  // Cache the result (even empty) to throttle repeated expansions
  ROSTER_CACHE.set(cacheKey, { ts: Date.now(), roster, reason, week: usedWeek });

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
    rawResponse: debug && attempts.length > 0 ? attempts[attempts.length - 1] : undefined
  });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  provisional.cookies.getAll().forEach(c => res.cookies.set(c));
  return res;
}