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
  week?: string | null;
  draftStatus?: string;
}

interface RosterResponse {
  ok: boolean;
  teamKey: string;
  week: string | null;
  roster: YahooPlayer[];
  players: YahooPlayer[]; // alias for backward compatibility
  empty: boolean;
  reason?: string;
  draftStatus?: string;
  attempts?: any[];
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
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// --- Memory-safe cache with cleanup ---
const ROSTER_CACHE = new LRUCache<string, CachedRoster>(1000);
const CACHE_TTL_MS = 15_000; // 15s

// --- Request deduplication to prevent concurrent duplicate API calls ---
const PENDING_REQUESTS = new Map<string, Promise<CachedRoster>>();

// --- Clean expired entries periodically ---
setInterval(() => {
  const now = Date.now();
  // Note: LRU cache doesn't expose iterator, so we'll rely on size limits for now
  // In production, you might want a more sophisticated cache with TTL cleanup
}, 60_000); // Clean every minute

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

  const { teamKey } = params;
  if (!teamKey) {
    return NextResponse.json({ ok: false, reason: 'missing_team_key' }, { status: 400 });
  }

  const urlObj = req.nextUrl;
  const debug = urlObj.searchParams.get('debug') === '1';
  const requestedWeek = urlObj.searchParams.get('week');
  
  // Safer cache key generation
  const cacheKey = `roster:${teamKey}:${requestedWeek || 'current'}`;

  // Check cache first
  const cached = ROSTER_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    if (debug) {
      console.log('[Roster] Cache hit', { cacheKey, playerCount: cached.roster.length });
    }
    return createResponse(provisional, teamKey, cached);
  }

  // Request deduplication - if same request is already in flight, wait for it
  if (PENDING_REQUESTS.has(cacheKey)) {
    if (debug) console.log('[Roster] Request deduplication', { cacheKey });
    const result = await PENDING_REQUESTS.get(cacheKey)!;
    return createResponse(provisional, teamKey, result);
  }

  // Create new request promise
  const requestPromise = fetchRosterData(access, teamKey, requestedWeek, debug);
  PENDING_REQUESTS.set(cacheKey, requestPromise);

  try {
    const result = await requestPromise;
    
    // Cache the result
    ROSTER_CACHE.set(cacheKey, result);
    
    return createResponse(provisional, teamKey, result);
  } finally {
    // Clean up pending request
    PENDING_REQUESTS.delete(cacheKey);
  }
}

// --- Separated roster fetching logic ---
async function fetchRosterData(
  access: string, 
  teamKey: string, 
  requestedWeek: string | null, 
  debug: boolean
): Promise<CachedRoster> {
  const attempts: any[] = [];
  let reason: string | undefined;
  let usedWeek: string | null = null;
  let roster: YahooPlayer[] = [];
  let draftStatus: string | undefined;

  // Build paths to try
  const paths: { label: string; path: string; week: string | null }[] = [];
  if (requestedWeek) {
    paths.push({ 
      label: 'with_week', 
      path: `team/${teamKey}/roster;week=${requestedWeek}`, 
      week: requestedWeek 
    });
  }
  paths.push({ 
    label: requestedWeek ? 'fallback_no_week' : 'base', 
    path: `team/${teamKey}/roster`, 
    week: null 
  });

  for (const pathConfig of paths) {
    if (roster.length > 0) break; // Already have data

    try {
      const fetchResult = await yahooFetch(access, pathConfig.path);
      attempts.push({ 
        attempt: pathConfig.label, 
        path: pathConfig.path, 
        status: fetchResult.status, 
        ok: fetchResult.ok 
      });

      // Handle auth failure immediately - no point trying other paths
      if (fetchResult.status === 401) {
        reason = 'unauthorized';
        break;
      }

      if (!fetchResult.ok) {
        reason = reason || 'yahoo_error';
        continue;
      }

      // Parse response
      const parsed = JSON.parse(fetchResult.text);
      draftStatus = parsed?.fantasy_content?.team?.[0]?.draft_status;
      roster = parseRoster(parsed);
      usedWeek = pathConfig.week;

    } catch (error: any) {
      attempts.push({ 
        attempt: pathConfig.label, 
        path: pathConfig.path, 
        error: error?.message || String(error) 
      });
      reason = reason || 'fetch_error';
    }
  }

  // Determine final reason if we don't have roster data
  if (!roster.length && !reason) {
    if (draftStatus && draftStatus !== 'postdraft') {
      reason = 'predraft';
    } else {
      reason = 'empty';
    }
  }

  if (debug) {
    console.log('[Roster] Fetch complete', {
      teamKey,
      requestedWeek,
      usedWeek,
      playerCount: roster.length,
      reason,
      draftStatus,
      attempts
    });
  }

  return {
    ts: Date.now(),
    roster,
    reason,
    week: usedWeek,
    draftStatus
  };
}

// --- Helper function for Yahoo API calls ---
async function yahooFetch(access: string, path: string) {
  const base = 'https://fantasysports.yahooapis.com/fantasy/v2';
  const url = `${base}/${path}?format=json`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${access}`,
      'Accept': 'application/json'
    }
  });

  const text = await response.text();
  return { status: response.status, ok: response.ok, text };
}

// --- Improved roster parsing with better error handling ---
function parseRoster(raw: any): YahooPlayer[] {
  try {
    const playersObj = raw?.fantasy_content?.team?.[1]?.roster?.[0]?.players;
    if (!playersObj || typeof playersObj !== 'object') {
      return [];
    }

    const playerEntries = Object.keys(playersObj)
      .filter(k => k !== 'count')
      .map(k => playersObj[k])
      .filter(Boolean);

    return playerEntries.map((entry: any): YahooPlayer => {
      const playerData = entry?.player || entry;
      const dataArray = Array.isArray(playerData) ? playerData : [];
      
      // Extract player metadata
      const meta = dataArray[0] || {};
      const nameObj = meta.name || {};
      const name = nameObj.full || meta.full || meta.name_full || 'Unknown Player';
      const team = meta.editorial_team_abbr || '';
      
      // Extract points
      const playerPointsObj = dataArray.find((x: any) => x?.player_points)?.player_points || {};
      const points = Number(playerPointsObj.total || playerPointsObj.approx_total || 0);
      
      // Extract position
      const selectedPosObj = dataArray.find((x: any) => x?.selected_position)?.selected_position || [];
      const position = selectedPosObj[0]?.position || meta.position || 'BN';
      
      // Extract status
      const status = meta.status || meta.injury_status || undefined;

      return {
        name,
        team,
        position,
        status,
        points
      };
    });
  } catch (error) {
    console.error('[Roster] Parse error:', error);
    return [];
  }
}

// --- Helper to create consistent responses ---
function createResponse(
  provisional: NextResponse, 
  teamKey: string, 
  cached: CachedRoster
): NextResponse {
  const response: RosterResponse = {
    ok: true,
    teamKey,
    week: cached.week,
    roster: cached.roster,
    players: cached.roster, // Alias for backward compatibility
    empty: cached.roster.length === 0,
    reason: cached.reason,
    draftStatus: cached.draftStatus
  };

  const res = NextResponse.json(response);
  
  // Set cache headers
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  
  // Copy cookies from provisional response
  provisional.cookies.getAll().forEach(cookie => {
    res.cookies.set(cookie);
  });

  return res;
}