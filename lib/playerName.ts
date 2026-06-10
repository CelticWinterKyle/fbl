// ─── Player-name matching key ─────────────────────────────────────────────────
// Pure and dependency-free: imported by server code (lib/odds.ts) AND client
// components, so it must never pull in KV/cache/env-dependent modules.

/**
 * Normalize a player name for cross-source matching: lowercase, diacritics
 * stripped, punctuation removed, Jr/Sr/II-style suffixes dropped. "Patrick
 * Mahomes II" (sportsbook) and "Patrick Mahomes" (Yahoo) both become
 * "patrick mahomes".
 */
export function playerNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,'’-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
