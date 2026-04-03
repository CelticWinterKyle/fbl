import type {
  NormalizedMatchup,
  NormalizedTeam,
  NormalizedRoster,
  NormalizedPlayer,
  RosterSlot,
  LegacyMatchup,
  LegacyTeam,
} from "@/lib/types/index";

// ─── Small numeric helper ─────────────────────────────────────────────────────

function n(x: any): number {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
}

// ─── Team/matchup key/name extractors ─────────────────────────────────────────

export function teamKeyOf(t: any): string | null {
  return t?.team_key || t?.team?.team_key || t?.team?.key || t?.key || null;
}

export function teamNameOf(t: any): string {
  return t?.name || t?.team_name || t?.team?.name || "Team";
}

// ─── Roster position normalizer ──────────────────────────────────────────────

function normalizePosition(pos: string): string {
  const s = String(pos || "").toUpperCase();
  const map: Record<string, string> = {
    "D/ST": "DEF", DST: "DEF", DEFENSE: "DEF", DE: "DEF",
    FLEX: "FLEX", "W/R/T": "FLEX", "WR/RB/TE": "FLEX", "W/R/T/QB": "FLEX",
  };
  return map[s] ?? (s || "BN");
}

// ─── League data ─────────────────────────────────────────────────────────────

export type LeagueDataResult = {
  matchups: LegacyMatchup[];
  teams: LegacyTeam[];
  meta: Record<string, any>;
  settings: Record<string, any>;
  rosterPositions: RosterSlot[];
};

export async function fetchLeagueData(yf: any, leagueKey: string): Promise<LeagueDataResult> {
  const [scoreRaw, metaRaw, standingsRaw, settingsRaw] = await Promise.all([
    yf.league.scoreboard(leagueKey).catch((e: any) => {
      console.error("[Yahoo] scoreboard error:", e?.message);
      return null;
    }),
    yf.league.meta(leagueKey).catch((e: any) => {
      console.error("[Yahoo] meta error:", e?.message);
      return null;
    }),
    yf.league.standings(leagueKey).catch((e: any) => {
      console.error("[Yahoo] standings error:", e?.message);
      return null;
    }),
    yf.league.settings(leagueKey).catch((e: any) => {
      console.error("[Yahoo] settings error:", e?.message);
      return null;
    }),
  ]);

  // ── Matchups ──
  const rawMatchups: any[] =
    scoreRaw?.matchups ?? scoreRaw?.scoreboard?.matchups ?? scoreRaw?.schedule?.matchups ?? [];

  const matchups: LegacyMatchup[] = rawMatchups.map((m: any) => {
    const a = m.teams?.[0] ?? m.team1 ?? m?.[0];
    const b = m.teams?.[1] ?? m.team2 ?? m?.[1];
    return {
      aN: teamNameOf(a),
      aP: n(a?.points ?? a?.team_points?.total ?? 0),
      aK: teamKeyOf(a) ?? "",
      bN: teamNameOf(b),
      bP: n(b?.points ?? b?.team_points?.total ?? 0),
      bK: teamKeyOf(b) ?? "",
    };
  });

  // ── Teams ──
  let teamsSource: any[] =
    standingsRaw?.standings?.teams ?? standingsRaw?.teams ?? [];

  if (!Array.isArray(teamsSource) || teamsSource.length === 0) {
    const teamsRaw = await yf.league.teams(leagueKey).catch(() => null);
    teamsSource = teamsRaw?.teams ?? teamsRaw?.league?.teams ?? [];
  }

  const teams: LegacyTeam[] = teamsSource.map((t: any) => ({
    name: t.name || t.team_name || "Team",
    wins: n(t.team_standings?.outcome_totals?.wins),
    losses: n(t.team_standings?.outcome_totals?.losses),
    ties: n(t.team_standings?.outcome_totals?.ties),
    points: n(t.team_points?.total),
    owner:
      t.managers?.[0]?.nickname ||
      t.managers?.[0]?.manager?.nickname ||
      "Owner",
  }));

  // ── Meta & settings ──
  const meta: Record<string, any> =
    metaRaw?.league?.[0] ?? metaRaw ?? {};
  const settings: Record<string, any> =
    settingsRaw?.league?.[0]?.settings?.[0] ?? settingsRaw ?? {};

  // ── Roster positions ──
  const rosterPositions = extractRosterPositions(settings);

  return { matchups, teams, meta, settings, rosterPositions };
}

function extractRosterPositions(ls: any): RosterSlot[] {
  const out: RosterSlot[] = [];
  const rp =
    ls?.roster_positions ||
    ls?.roster_position ||
    ls?.settings?.roster_positions;
  if (!rp) return out;

  const arr = Array.isArray(rp) ? rp : rp?.[0]?.roster_positions ?? rp?.[0] ?? [];
  const items = Array.isArray(arr)
    ? arr
    : arr?.roster_position ?? arr?.[0]?.roster_position ?? [];
  const list = Array.isArray(items) ? items : [];

  for (const it of list) {
    const pos = it?.position || it?.roster_position || it?.name;
    const count = n(it?.count ?? it?.num ?? 1);
    if (pos) {
      out.push({
        position: normalizePosition(pos),
        count: Number.isFinite(count) ? count : 1,
      });
    }
  }
  return out;
}

// ─── Direct HTTP roster fetch ─────────────────────────────────────────────────

const YAHOO_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

async function yahooFetch(
  access: string,
  path: string,
  retries = 2
): Promise<{ status: number; ok: boolean; text: string }> {
  const url = `${YAHOO_BASE}/${path}?format=json`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${access}`,
          Accept: "application/json",
          "User-Agent": "FBL/1.0",
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const text = await r.text();

      // 401 — report immediately, don't retry (caller handles refresh)
      if (r.status === 401) return { status: 401, ok: false, text };

      if (r.ok) return { status: r.status, ok: true, text };

      // 5xx → retry with backoff
      if (r.status >= 500 && attempt < retries) {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        continue;
      }

      return { status: r.status, ok: false, text };
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (attempt < retries && e.name !== "AbortError") {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }

  throw new Error("Max retries exceeded");
}

// ─── parseRoster: Yahoo JSON → NormalizedPlayer[] ────────────────────────────

function totalFrom(obj: any): number {
  if (!obj) return 0;
  if (typeof obj === "number" || typeof obj === "string") return Number(obj) || 0;
  if (Array.isArray(obj)) {
    for (const it of obj) {
      if (it && typeof it === "object" && "total" in it) return Number(it.total) || 0;
    }
    for (const it of obj) {
      const x = Number(it?.value ?? it?.points ?? NaN);
      if (Number.isFinite(x)) return x;
    }
    return 0;
  }
  if (typeof obj === "object") {
    if ("total" in obj) return Number(obj.total) || 0;
    const x = Number(obj.points ?? obj.value ?? NaN);
    return Number.isFinite(x) ? x : 0;
  }
  return 0;
}

function deepFind<T>(arr: any[], pred: (o: any) => T | undefined): T | undefined {
  for (const it of arr) {
    if (!it) continue;
    const val = pred(it);
    if (val !== undefined) return val;
  }
  return undefined;
}

function deepSelectedSlot(arr: any[]): string | undefined {
  const slots: string[] = [];
  for (const it of arr) {
    if (!it) continue;
    const sp = it.selected_position || it.selected_positions || it.selected_position_list;
    if (!sp) continue;
    const push = (v: any) => {
      const s =
        typeof v === "string"
          ? v
          : v && typeof v === "object"
          ? v.position || v.pos
          : undefined;
      if (s) slots.push(String(s));
    };
    if (Array.isArray(sp)) sp.forEach(push);
    else if (typeof sp === "object") {
      Object.keys(sp).forEach((k) => {
        if (k !== "count") push((sp as any)[k]);
      });
      push(sp);
    } else if (typeof sp === "string") {
      slots.push(sp);
    }
  }
  const firstNonBn = slots.find((s) => s.toUpperCase() !== "BN");
  return firstNonBn ?? (slots.length ? slots[slots.length - 1] : undefined);
}

function coercePrimaryPosition(pd: any, arr: any[]): string | undefined {
  const direct =
    pd.display_position ||
    pd.primary_position ||
    pd.player_primary_position ||
    pd.position ||
    pd.display_pos;
  if (typeof direct === "string" && direct.trim()) return direct;

  const editorial = pd.editorial_positions || pd.editorial_position || pd.position_types;
  if (typeof editorial === "string" && editorial.trim())
    return editorial.split(/[,/]/)[0].trim();
  if (Array.isArray(editorial) && editorial.length) return String(editorial[0]);

  const elig = pd.eligible_positions || pd.player_eligible_positions;
  if (Array.isArray(elig) && elig.length) {
    const first = elig.find(
      (x: any) => (x?.position || x?.pos) && String(x.position || x.pos).toUpperCase() !== "BN"
    );
    if (first) return String(first.position || first.pos);
  } else if (elig && typeof elig === "object") {
    for (const k of Object.keys(elig).filter((k) => k !== "count")) {
      const v = (elig as any)[k];
      const pos = v?.position || v?.pos || v;
      if (pos && String(pos).toUpperCase() !== "BN") return String(pos);
    }
  }

  // Fall back to deep scan of original array
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const d =
      it.display_position || it.primary_position || it.player_primary_position;
    if (typeof d === "string" && d.trim()) return d;
  }

  return undefined;
}

function parseRosterJson(raw: any, preferPrimary = false): NormalizedPlayer[] {
  try {
    const team = raw?.fantasy_content?.team;
    if (!Array.isArray(team) || team.length < 2) return [];

    const rosterData = team[1]?.roster;
    if (!rosterData) return [];

    const rosterObj = rosterData["0"] ?? rosterData[0];
    if (!rosterObj) return [];

    const playersData = rosterObj.players;
    if (!playersData || typeof playersData !== "object") return [];

    const playerKeys = Object.keys(playersData).filter((k) => k !== "count");

    return playerKeys.map((key): NormalizedPlayer => {
      const playerEntry = playersData[key];
      if (!playerEntry?.player) {
        return {
          id: key, platform: "yahoo", name: "Unknown Player",
          position: "BN", primaryPosition: "BN", nflTeam: "",
          points: 0, projectedPoints: 0, platformKey: key,
        };
      }

      const playerArray: any[] = playerEntry.player;
      if (!Array.isArray(playerArray) || playerArray.length === 0) {
        return {
          id: key, platform: "yahoo", name: "Unknown Player",
          position: "BN", primaryPosition: "BN", nflTeam: "",
          points: 0, projectedPoints: 0, platformKey: key,
        };
      }

      // Flatten the Yahoo array-of-objects into a single working object
      const pd: any = {};
      playerArray.forEach((item: any) => {
        if (Array.isArray(item)) {
          item.forEach((sub: any) => {
            if (sub && typeof sub === "object") Object.assign(pd, sub);
          });
        } else if (item && typeof item === "object") {
          Object.assign(pd, item);
        }
      });

      const name = pd.name?.full || "Unknown Player";
      const nflTeam = pd.editorial_team_abbr || "";

      // Slot position
      const deepSlot = deepSelectedSlot(playerArray);
      let rawSlot: any = deepSlot || pd.selected_position || pd.selected_positions;
      let slotCandidate: string;

      if (typeof rawSlot === "string") {
        slotCandidate = rawSlot;
      } else if (Array.isArray(rawSlot)) {
        const nonBn = rawSlot.find(
          (x: any) => String(x?.position || x?.pos || x).toUpperCase() !== "BN"
        );
        const candidate = nonBn ?? rawSlot[rawSlot.length - 1];
        slotCandidate = candidate?.position || candidate?.pos || String(candidate) || "BN";
      } else if (rawSlot && typeof rawSlot === "object") {
        slotCandidate = rawSlot.position || rawSlot.pos || "BN";
      } else {
        slotCandidate = "BN";
      }

      const primaryCandidate = coercePrimaryPosition(pd, playerArray);
      const rawPosition =
        preferPrimary && primaryCandidate
          ? primaryCandidate
          : slotCandidate || primaryCandidate || "BN";

      const position = normalizePosition(rawPosition);
      const primaryPosition = normalizePosition(primaryCandidate || rawPosition);

      const points = totalFrom(pd.player_points) || totalFrom(pd.points);
      const projectedPoints =
        totalFrom(pd.player_projected_points) || totalFrom(pd.projected_points);

      // Game context
      const kickoffRaw = deepFind<any>(playerArray, (it) => {
        for (const k of Object.keys(it || {})) {
          if (k.includes("start_time") || k.includes("kickoff") || k === "start") {
            const v = it[k];
            const num = Number(v);
            if (Number.isFinite(num) && num > 0) return num;
          }
        }
        return undefined;
      });
      const kickoffMs = kickoffRaw
        ? kickoffRaw > 2_000_000_000
          ? kickoffRaw
          : kickoffRaw * 1000
        : null;

      let opponent =
        deepFind<string>(
          playerArray,
          (it) =>
            it?.opponent_team_abbr ||
            it?.opp_team_abbr ||
            it?.opponent_abbr ||
            it?.player_opponent?.team_abbr ||
            undefined
        ) ?? null;

      if (!opponent) {
        const bye = deepFind<any>(playerArray, (it) => it?.bye_weeks || it?.bye_week);
        if (bye) opponent = "BYE";
      }

      const awayFlag = deepFind<any>(
        playerArray,
        (it) => (typeof it?.is_away === "boolean" ? it.is_away : undefined)
      );
      const isHome = awayFlag === undefined ? null : !awayFlag;

      const status = (() => {
        const s = String(pd.status || "").toLowerCase();
        if (!s) return undefined;
        if (s === "q" || s === "questionable") return "questionable" as const;
        if (s === "o" || s === "out") return "out" as const;
        if (s === "ir") return "ir" as const;
        if (s === "d" || s === "doubtful") return "doubtful" as const;
        return undefined;
      })();

      const platformKey = pd.player_key || pd.key || key;

      return {
        id: platformKey,
        platform: "yahoo",
        name,
        position,
        primaryPosition,
        nflTeam,
        status,
        points,
        projectedPoints,
        kickoffMs,
        opponent,
        isHome,
        platformKey,
      };
    });
  } catch (e) {
    console.error("[Yahoo] parseRosterJson error:", e);
    return [];
  }
}

// ─── Projection enrichment (batch player stats lookup) ───────────────────────

async function enrichWithProjections(
  access: string,
  players: NormalizedPlayer[],
  week: string
): Promise<NormalizedPlayer[]> {
  const needsProj = players.some((p) => !p.projectedPoints);
  if (!needsProj) return players;

  const keys = players.map((p) => p.platformKey).filter(Boolean);
  if (!keys.length) return players;

  const projectedByKey: Record<string, number> = {};
  const BATCH = 25;

  for (let i = 0; i < keys.length; i += BATCH) {
    const batch = keys.slice(i, i + BATCH);
    const path = `players;player_keys=${encodeURIComponent(batch.join(","))}/stats;type=week;week=${week};is_projected=1`;
    try {
      const resp = await yahooFetch(access, path);
      if (!resp.ok) continue;

      let json: any = null;
      try { json = JSON.parse(resp.text); } catch { continue; }

      const entries = json?.fantasy_content?.players ?? json?.players ?? {};
      for (const k of Object.keys(entries).filter((k) => k !== "count")) {
        const entry = entries[k]?.player ?? entries[k];
        const flat = Array.isArray(entry)
          ? Object.assign({}, ...entry.filter((x: any) => x && typeof x === "object"))
          : entry;

        const pkey = flat?.player_key ?? flat?.key;
        const proj =
          totalFrom(flat?.player_projected_points) ||
          totalFrom(flat?.player_points) ||
          (Array.isArray(entry)
            ? (() => {
                for (const piece of entry) {
                  const v = totalFrom(
                    piece?.player_projected_points ?? piece?.player_points ?? piece?.stats
                  );
                  if (v) return v;
                }
                return 0;
              })()
            : 0);

        if (pkey && Number.isFinite(proj) && proj > 0) {
          projectedByKey[pkey] = proj;
        }
      }
    } catch (e) {
      console.error("[Yahoo] projection enrichment batch error:", e);
    }
  }

  if (!Object.keys(projectedByKey).length) return players;

  return players.map((p) =>
    p.platformKey && projectedByKey[p.platformKey] !== undefined
      ? { ...p, projectedPoints: projectedByKey[p.platformKey] }
      : p
  );
}

// ─── fetchRoster ─────────────────────────────────────────────────────────────

export async function fetchRoster(
  access: string,
  teamKey: string,
  leagueKey: string,
  week?: string | number | null
): Promise<NormalizedRoster> {
  // Derive current week if not provided
  let resolvedWeek: string | null = week ? String(week) : null;

  if (!resolvedWeek) {
    try {
      const resp = await yahooFetch(access, `league/${leagueKey}/scoreboard`);
      if (resp.ok) {
        const json = JSON.parse(resp.text);
        const leagueArr = json?.fantasy_content?.league;
        const w = Number(
          leagueArr?.[1]?.scoreboard?.[0]?.week ??
          leagueArr?.[1]?.scoreboard?.week ??
          json?.week
        );
        if (Number.isFinite(w) && w > 0) resolvedWeek = String(w);
      }
    } catch {}
  }

  // Try roster fetch with week first, then without
  const paths = [
    ...(resolvedWeek ? [`team/${teamKey}/roster;week=${resolvedWeek}`] : []),
    `team/${teamKey}/roster`,
  ];

  let players: NormalizedPlayer[] = [];
  let usedWeek: string | null = resolvedWeek;
  let draftStatus: string | undefined;

  for (const path of paths) {
    if (players.length > 0) break;

    const resp = await yahooFetch(access, path);
    if (resp.status === 401) break; // auth failure — stop trying

    if (!resp.ok) continue;

    let json: any;
    try { json = JSON.parse(resp.text); } catch { continue; }

    draftStatus = json?.fantasy_content?.team?.[0]?.draft_status;
    const preferPrimary =
      !!draftStatus && String(draftStatus).toLowerCase() !== "postdraft";

    players = parseRosterJson(json, preferPrimary);
    if (!resolvedWeek) usedWeek = null;
  }

  // Enrich with projections
  if (players.length > 0 && usedWeek) {
    players = await enrichWithProjections(access, players, usedWeek);
  }

  const starters = players.filter(
    (p) => p.position !== "BN" && p.position !== "IR"
  );
  const bench = players.filter(
    (p) => p.position === "BN" || p.position === "IR"
  );

  return {
    teamId: teamKey,
    leagueId: leagueKey,
    platform: "yahoo",
    week: usedWeek ? Number(usedWeek) : null,
    starters,
    bench,
    all: players,
  };
}

// ─── Analysis helpers (used by analyze-matchup route) ────────────────────────

export function extractStarterQB(
  roster: NormalizedRoster
): { name: string; proj: number } | null {
  const candidates = roster.starters.filter(
    (p) => p.position === "QB" || p.primaryPosition === "QB"
  );
  if (!candidates.length) {
    // Fall back to any QB on the roster
    const any = roster.all.find(
      (p) => p.position === "QB" || p.primaryPosition === "QB"
    );
    if (!any) return null;
    return { name: any.name, proj: any.projectedPoints };
  }
  const best = candidates.sort((a, b) => b.projectedPoints - a.projectedPoints)[0];
  return { name: best.name, proj: best.projectedPoints };
}

export function extractInjurySummary(roster: NormalizedRoster): {
  questionable: number;
  out: number;
  ir: number;
} {
  let questionable = 0, out = 0, ir = 0;
  for (const p of roster.all) {
    if (p.status === "questionable") questionable++;
    else if (p.status === "out" || p.status === "doubtful") out++;
    else if (p.status === "ir") ir++;
  }
  return { questionable, out, ir };
}

export function extractStarterTeamAbbrs(roster: NormalizedRoster): string[] {
  return roster.starters.map((p) => p.nflTeam).filter(Boolean);
}
