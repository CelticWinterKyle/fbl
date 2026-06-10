// ─── NFL game lines (informational only) ─────────────────────────────────────
// Phase A of docs/ODDS_MONETIZATION_PLAN.md: odds are published as content.
// No affiliate links, no link-outs, no bet language. Two sources:
//   1. DEFAULT: ESPN's free public scoreboard (site.api.espn.com) — the same
//      endpoint lib/nflPlays.ts uses. Pre-kickoff events carry an odds object;
//      completed games (and sometimes whole slates) omit it, so everything is
//      parsed defensively and games without lines still come back (the UI
//      shows them as "no line yet").
//   2. The Odds API (the-odds-api.com) when ODDS_API_KEY is set.
// One global fetch cached in KV; cost does not scale with users.

import { withCache } from "@/lib/cache";
import { isNflGameWindow } from "@/lib/gameWindow";
import { playerNameKey } from "@/lib/playerName";

export { playerNameKey };

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const ODDS_API_URL =
  "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";

export const ODDS_CACHE_KEY = "odds:nfl:current";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NormalizedGameOdds = {
  gameId: string;
  kickoff: string; // ISO timestamp
  state: "pre" | "in" | "post";
  home: { name: string; abbrev: string; moneyline: number | null };
  away: { name: string; abbrev: string; moneyline: number | null };
  spread: { favorite: string | null; line: number | null; details: string | null };
  total: number | null;
  provider: string;
};

export type NflOddsPayload = {
  games: NormalizedGameOdds[];
  source: string;
  updatedAt: number;
};

// ─── Fetch helper (10s timeout) ───────────────────────────────────────────────

async function getJson(url: string, timeoutMs = 10_000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      // Our withCache layer owns the TTL; never let fetch-level caching stack.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ─── Shared parsing helpers ───────────────────────────────────────────────────

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrEmpty(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ─── ESPN scoreboard parsing (pure, unit-tested) ──────────────────────────────

/**
 * Normalize an ESPN public-scoreboard response into game lines. Defensive on
 * every access: ESPN omits the odds object on completed games and sometimes
 * entirely; a game without odds is still returned with null lines.
 */
export function parseEspnScoreboardOdds(raw: unknown): NormalizedGameOdds[] {
  const events = (raw as any)?.events;
  if (!Array.isArray(events)) return [];

  const out: NormalizedGameOdds[] = [];
  for (const e of events) {
    const comp = e?.competitions?.[0];
    const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
    const homeC = competitors.find((c) => c?.homeAway === "home");
    const awayC = competitors.find((c) => c?.homeAway === "away");
    if (!homeC?.team || !awayC?.team) continue;

    const odds = Array.isArray(comp?.odds) ? comp.odds[0] : undefined;
    const rawState = e?.status?.type?.state;
    const state: NormalizedGameOdds["state"] =
      rawState === "in" || rawState === "post" ? rawState : "pre";

    // ESPN's `details` is the human spread, e.g. "KC -3.5" (or "EVEN").
    const detailsRaw = strOrEmpty(odds?.details).trim();
    const details = detailsRaw || null;
    let favorite: string | null = null;
    let line: number | null = null;
    const m = detailsRaw.match(/^([A-Za-z]{2,4})\s+(-?\d+(?:\.\d+)?)$/);
    if (m) {
      favorite = m[1].toUpperCase();
      line = numOrNull(m[2]);
    } else {
      // Fall back to the numeric spread when details didn't parse.
      line = numOrNull(odds?.spread);
    }

    out.push({
      gameId: String(e?.id ?? ""),
      kickoff: strOrEmpty(e?.date),
      state,
      home: {
        name: strOrEmpty(homeC.team?.displayName),
        abbrev: strOrEmpty(homeC.team?.abbreviation),
        moneyline: numOrNull(odds?.homeTeamOdds?.moneyLine),
      },
      away: {
        name: strOrEmpty(awayC.team?.displayName),
        abbrev: strOrEmpty(awayC.team?.abbreviation),
        moneyline: numOrNull(odds?.awayTeamOdds?.moneyLine),
      },
      spread: { favorite, line, details },
      total: numOrNull(odds?.overUnder),
      provider: strOrEmpty(odds?.provider?.name),
    });
  }
  return out;
}

// ─── The Odds API parsing ─────────────────────────────────────────────────────

// The Odds API identifies teams by full name only; the UI speaks abbreviations.
const NFL_ABBREV: Record<string, string> = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WSH",
};

function abbrevFor(teamName: string): string {
  const known = NFL_ABBREV[teamName];
  if (known) return known;
  // Unknown name (relocation, rename): degrade to the last word's first three
  // letters so the UI still shows something team-shaped.
  const last = teamName.trim().split(/\s+/).pop() ?? "";
  return last.slice(0, 3).toUpperCase();
}

function parseTheOddsApi(raw: unknown): NormalizedGameOdds[] {
  if (!Array.isArray(raw)) return [];

  const out: NormalizedGameOdds[] = [];
  for (const g of raw as any[]) {
    const homeName = strOrEmpty(g?.home_team);
    const awayName = strOrEmpty(g?.away_team);
    if (!homeName || !awayName) continue;

    const bookmakers: any[] = Array.isArray(g?.bookmakers) ? g.bookmakers : [];
    const marketKeys = (b: any): Set<string> =>
      new Set((Array.isArray(b?.markets) ? b.markets : []).map((m: any) => m?.key));
    // Prefer the first book quoting all three markets; otherwise take the first.
    const book =
      bookmakers.find((b) => {
        const keys = marketKeys(b);
        return keys.has("h2h") && keys.has("spreads") && keys.has("totals");
      }) ?? bookmakers[0];

    const markets: any[] = Array.isArray(book?.markets) ? book.markets : [];
    const outcomesOf = (key: string): any[] => {
      const market = markets.find((m) => m?.key === key);
      return Array.isArray(market?.outcomes) ? market.outcomes : [];
    };

    const h2h = outcomesOf("h2h");
    const homeMl = numOrNull(h2h.find((o) => o?.name === homeName)?.price);
    const awayMl = numOrNull(h2h.find((o) => o?.name === awayName)?.price);

    // Spread favorite = the outcome with the negative point.
    const spreads = outcomesOf("spreads");
    const fav = spreads.find((o) => Number(o?.point) < 0);
    const favorite = fav ? abbrevFor(strOrEmpty(fav.name)) : null;
    const line = fav ? numOrNull(fav.point) : null;
    const details = favorite && line !== null ? `${favorite} ${line}` : null;

    const total = numOrNull(outcomesOf("totals")[0]?.point);

    const kickoff = strOrEmpty(g?.commence_time);
    const kickoffMs = Date.parse(kickoff);
    // The Odds API only lists upcoming/live games, so this binary guess is safe.
    const state: NormalizedGameOdds["state"] =
      Number.isFinite(kickoffMs) && kickoffMs <= Date.now() ? "in" : "pre";

    out.push({
      gameId: String(g?.id ?? ""),
      kickoff,
      state,
      home: { name: homeName, abbrev: abbrevFor(homeName), moneyline: homeMl },
      away: { name: awayName, abbrev: abbrevFor(awayName), moneyline: awayMl },
      spread: { favorite, line, details },
      total,
      provider: strOrEmpty(book?.title),
    });
  }
  return out;
}

// ─── Public fetchers ──────────────────────────────────────────────────────────

/**
 * Fetch this week's NFL game lines. Uses The Odds API when ODDS_API_KEY is
 * configured; otherwise ESPN's free public scoreboard. NOT user-specific, so
 * it's safe to cache globally.
 */
export async function fetchNflOdds(): Promise<NflOddsPayload> {
  const updatedAt = Date.now();
  const apiKey = process.env.ODDS_API_KEY;

  if (apiKey) {
    const url =
      `${ODDS_API_URL}?regions=us&markets=h2h,spreads,totals&oddsFormat=american` +
      `&apiKey=${encodeURIComponent(apiKey)}`;
    const games = parseTheOddsApi(await getJson(url));
    const source = games.find((g) => g.provider)?.provider || "The Odds API";
    return { games, source, updatedAt };
  }

  const games = parseEspnScoreboardOdds(await getJson(SCOREBOARD_URL));
  const source = games.find((g) => g.provider)?.provider || "ESPN";
  return { games, source, updatedAt };
}

/**
 * Cached game lines: one global fetch shared by every viewer. 10 minutes off
 * the clock, 5 minutes during live NFL windows (lines move faster in-game).
 */
export async function getCachedNflOdds(): Promise<NflOddsPayload> {
  const ttl = isNflGameWindow() ? 300 : 600;
  return withCache(ODDS_CACHE_KEY, ttl, fetchNflOdds);
}

// ─── Player props ─────────────────────────────────────────────────────────────
// Pulled forward from Phase C by documented decision (2026-06-10): props are
// published as content inside the Odds tab, same compliance posture as game
// lines. NO link-outs, no bet language; that stays gated behind Phase B.
// Props exist only on The Odds API (ESPN scoreboard has none), so this whole
// surface is dormant until ODDS_API_KEY is set.

const ODDS_API_EVENTS_URL =
  "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events";

export const PROPS_CACHE_KEY = "odds:nfl:props";

/** Per-event request cap: 4 markets x 1 region = ~4 quota credits per event. */
const PROP_MARKETS = [
  "player_anytime_td",
  "player_pass_yds",
  "player_rush_yds",
  "player_reception_yds",
] as const;

const MAX_PROP_EVENTS = 16; // one NFL week's slate

export type PropMarket = (typeof PROP_MARKETS)[number];

export type PlayerPropLine = {
  market: PropMarket;
  /** UI label, e.g. "Anytime TD", "Pass Yds" */
  label: string;
  /** "Yes" for anytime TD, "O 274.5" for over/unders */
  value: string;
  /** American odds for the Yes/Over side */
  price: number | null;
};

export type NormalizedPlayerProps = {
  /** Display name as the book lists it */
  player: string;
  /** Normalized key for roster matching — see playerNameKey() */
  nameKey: string;
  lines: PlayerPropLine[];
  gameId: string;
  kickoff: string;
  book: string;
};

export type NflPropsPayload = {
  props: NormalizedPlayerProps[];
  source: string;
  updatedAt: number;
};

const MARKET_LABEL: Record<PropMarket, string> = {
  player_anytime_td: "Anytime TD",
  player_pass_yds: "Pass Yds",
  player_rush_yds: "Rush Yds",
  player_reception_yds: "Rec Yds",
};

/**
 * Normalize one The Odds API per-event odds response into per-player props.
 * Player props outcomes carry the player in `description` ("Over"/"Under"/
 * "Yes" in `name`); older shapes put the player in `name`. Parsed defensively
 * — anything malformed is skipped, never thrown.
 */
export function parseTheOddsApiEventProps(raw: unknown): NormalizedPlayerProps[] {
  const g = raw as any;
  if (!g || typeof g !== "object") return [];

  const gameId = String(g?.id ?? "");
  const kickoff = strOrEmpty(g?.commence_time);
  const bookmakers: any[] = Array.isArray(g?.bookmakers) ? g.bookmakers : [];

  // playerKey -> accumulated props (first book quoting a market wins)
  const byPlayer = new Map<string, NormalizedPlayerProps>();

  for (const book of bookmakers) {
    const bookTitle = strOrEmpty(book?.title) || strOrEmpty(book?.key);
    const markets: any[] = Array.isArray(book?.markets) ? book.markets : [];

    for (const market of markets) {
      const key = market?.key as PropMarket;
      if (!PROP_MARKETS.includes(key)) continue;
      const outcomes: any[] = Array.isArray(market?.outcomes) ? market.outcomes : [];

      for (const o of outcomes) {
        const side = strOrEmpty(o?.name);
        // Keep only the Yes/Over side; Under/No add noise without meaning
        // in a no-link informational card.
        if (key === "player_anytime_td") {
          if (side && side !== "Yes" && !o?.description) continue;
        } else if (side !== "Over") {
          continue;
        }

        const player = strOrEmpty(o?.description) || (key === "player_anytime_td" ? side : "");
        if (!player || player === "Yes" || player === "Over") continue;

        const nameKey = playerNameKey(player);
        let entry = byPlayer.get(nameKey);
        if (!entry) {
          entry = { player, nameKey, lines: [], gameId, kickoff, book: bookTitle };
          byPlayer.set(nameKey, entry);
        }
        // First book to quote a market for this player wins; skip duplicates.
        if (entry.lines.some((l) => l.market === key)) continue;

        const point = numOrNull(o?.point);
        entry.lines.push({
          market: key,
          label: MARKET_LABEL[key],
          value: key === "player_anytime_td" ? "Yes" : point !== null ? `O ${point}` : "O -",
          price: numOrNull(o?.price),
        });
      }
    }
  }

  return Array.from(byPlayer.values()).filter((p) => p.lines.length > 0);
}

/**
 * Fetch player props for this week's slate from The Odds API. Returns an empty
 * payload when ODDS_API_KEY is absent (dormant until the key is provisioned).
 * NOT user-specific — cache globally, filter per user at the API layer.
 */
export async function fetchNflPlayerProps(): Promise<NflPropsPayload> {
  const updatedAt = Date.now();
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return { props: [], source: "", updatedAt };

  const events = await getJson(
    `${ODDS_API_EVENTS_URL}?apiKey=${encodeURIComponent(apiKey)}`
  );
  if (!Array.isArray(events)) return { props: [], source: "", updatedAt };

  // Cap quota spend: nearest events first, one week's slate at most.
  const upcoming = (events as any[])
    .filter((e) => typeof e?.id === "string")
    .sort((a, b) => Date.parse(a?.commence_time ?? "") - Date.parse(b?.commence_time ?? ""))
    .slice(0, MAX_PROP_EVENTS);

  const results = await Promise.all(
    upcoming.map((e) =>
      getJson(
        `${ODDS_API_EVENTS_URL}/${encodeURIComponent(e.id)}/odds` +
          `?regions=us&oddsFormat=american&markets=${PROP_MARKETS.join(",")}` +
          `&apiKey=${encodeURIComponent(apiKey)}`
      )
    )
  );

  const props = results.flatMap((r) => parseTheOddsApiEventProps(r));
  const source = props.find((p) => p.book)?.book || "The Odds API";
  return { props, source, updatedAt };
}

/**
 * Cached props: one global fetch shared by every viewer. Props cost real API
 * quota (4 markets x 16 events per refresh), so the TTL is long: 30 minutes
 * off the clock, 15 during live windows.
 */
export async function getCachedNflPlayerProps(): Promise<NflPropsPayload> {
  const ttl = isNflGameWindow() ? 900 : 1800;
  return withCache(PROPS_CACHE_KEY, ttl, fetchNflPlayerProps);
}
