"use client";
// Trade analyzer (SEASON_FEATURES_PLAN.md #6): pick players to give from
// your roster and players to get from another team in the league, get a
// structured AI verdict, share the verdict card. Lives collapsed at the
// bottom of each My Team league card.

import { useState, useCallback } from "react";
import Link from "next/link";
import { ChevronDown, ArrowLeftRight, Share2, Check, Sparkles } from "lucide-react";

type Player = { name: string; position: string; team: string | null };

type TeamEntry = { teamKey: string; teamName: string; ownerName?: string };

type Verdict = {
  verdict: "accept" | "reject" | "fair";
  fairness: number;
  summary: string;
  reasoning: string;
  lineupImpact: string;
  give: string[];
  get: string[];
};

const VERDICT_STYLE: Record<Verdict["verdict"], { label: string; cls: string }> = {
  accept: { label: "TAKE IT", cls: "border-accent-strong/50 bg-accent-strong/15 text-accent" },
  reject: { label: "WALK AWAY", cls: "border-red-700/50 bg-red-900/20 text-red-400" },
  fair: { label: "EVEN TRADE", cls: "border-pitch-600 bg-pitch-800/60 text-gray-300" },
};

function PlayerPick({
  player,
  selected,
  onToggle,
}: {
  player: Player;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
        selected
          ? "border-accent-strong/50 bg-accent-strong/10"
          : "border-pitch-700 bg-pitch-900 hover:bg-pitch-800"
      }`}
    >
      <span
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
          selected ? "bg-accent border-accent" : "border-pitch-600"
        }`}
      >
        {selected && <Check className="w-3 h-3 text-pitch-950" />}
      </span>
      <span className={`text-sm truncate ${selected ? "text-accent-soft font-semibold" : "text-gray-300"}`}>
        {player.name}
      </span>
      <span className="ml-auto text-[10px] font-bold tracking-wider text-gray-600 uppercase shrink-0">
        {player.position}
        {player.team ? ` · ${player.team}` : ""}
      </span>
    </button>
  );
}

export default function TradeAnalyzer({
  platform,
  leagueId,
  myTeamKey,
  myTeamName,
  myPlayers,
}: {
  platform: "yahoo" | "sleeper" | "espn";
  leagueId: string;
  myTeamKey: string;
  myTeamName: string;
  myPlayers: Player[];
}) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<TeamEntry[] | null>(null);
  const [theirTeamKey, setTheirTeamKey] = useState("");
  const [theirPlayers, setTheirPlayers] = useState<Player[] | null>(null);
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Verdict | null>(null);
  const [copied, setCopied] = useState(false);

  const openPanel = useCallback(async () => {
    setOpen((v) => !v);
    if (teams !== null) return;
    try {
      const res = await fetch(
        `/api/user/league-teams?platform=${platform}&leagueId=${encodeURIComponent(leagueId)}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      const list: TeamEntry[] = (data?.teams ?? []).filter((t: TeamEntry) => t.teamKey !== myTeamKey);
      setTeams(list);
    } catch {
      setTeams([]);
    }
  }, [teams, platform, leagueId, myTeamKey]);

  const pickTeam = useCallback(
    async (teamKey: string) => {
      setTheirTeamKey(teamKey);
      setTheirPlayers(null);
      setGet(new Set());
      setResult(null);
      if (!teamKey) return;
      try {
        const params = new URLSearchParams({ platform, leagueKey: leagueId });
        const res = await fetch(`/api/roster/${encodeURIComponent(teamKey)}?${params}`, { cache: "no-store" });
        const data = await res.json();
        const players: Player[] = [...(data?.starters ?? []), ...(data?.bench ?? [])].map((p: any) => ({
          name: p.name,
          position: p.position ?? "",
          team: p.team ?? null,
        }));
        setTheirPlayers(players);
      } catch {
        setTheirPlayers([]);
      }
    },
    [platform, leagueId]
  );

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else if (next.size < 5) next.add(name);
    setter(next);
    setResult(null);
  };

  const analyze = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          platform,
          leagueKey: leagueId,
          myTeamKey,
          theirTeamKey,
          myTeamName,
          theirTeamName: teams?.find((t) => t.teamKey === theirTeamKey)?.teamName ?? "",
          give: [...give],
          get: [...get],
        }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.message || "Couldn't analyze that trade right now.");
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Couldn't analyze that trade right now.");
    } finally {
      setBusy(false);
    }
  }, [platform, leagueId, myTeamKey, myTeamName, theirTeamKey, teams, give, get]);

  const shareUrl = result
    ? `/share/trade?${new URLSearchParams({
        verdict: result.verdict,
        fairness: String(result.fairness),
        give: result.give.join(", "),
        get: result.get.join(", "),
        summary: result.summary.slice(0, 140),
      }).toString()}`
    : "";

  const copyShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // The preview link still works.
    }
  }, [shareUrl]);

  const ready = theirTeamKey && give.size > 0 && get.size > 0 && !busy;

  return (
    <div className="border-t border-pitch-700/40">
      <button
        onClick={openPanel}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase hover:bg-pitch-800 transition-colors"
      >
        <span className="inline-flex items-center gap-2">
          <ArrowLeftRight className="w-3.5 h-3.5" />
          Trade analyzer
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-5 pt-2 space-y-4 border-t border-pitch-700/30">
          {/* Opponent picker */}
          <div>
            <label className="block text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-1.5">
              Trading with
            </label>
            <select
              value={theirTeamKey}
              onChange={(e) => pickTeam(e.target.value)}
              className="w-full bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:border-accent-strong/60 focus:outline-none"
            >
              <option value="">Pick a team...</option>
              {(teams ?? []).map((t) => (
                <option key={t.teamKey} value={t.teamKey}>
                  {t.teamName}
                  {t.ownerName ? ` (${t.ownerName})` : ""}
                </option>
              ))}
            </select>
          </div>

          {theirTeamKey && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">
                  You give <span className="text-gray-700">(up to 5)</span>
                </p>
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {myPlayers.map((p) => (
                    <PlayerPick
                      key={p.name}
                      player={p}
                      selected={give.has(p.name)}
                      onToggle={() => toggle(give, setGive, p.name)}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">
                  You get <span className="text-gray-700">(up to 5)</span>
                </p>
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {theirPlayers === null ? (
                    <p className="text-xs text-gray-600 px-1 py-2">Loading roster...</p>
                  ) : theirPlayers.length === 0 ? (
                    <p className="text-xs text-gray-600 px-1 py-2">Couldn&apos;t load that roster.</p>
                  ) : (
                    theirPlayers.map((p) => (
                      <PlayerPick
                        key={p.name}
                        player={p}
                        selected={get.has(p.name)}
                        onToggle={() => toggle(get, setGet, p.name)}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {theirTeamKey && (
            <button
              onClick={analyze}
              disabled={!ready}
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold rounded-lg transition-colors tracking-wider text-sm disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-pitch-900"
            >
              <Sparkles className="w-4 h-4" />
              {busy ? "Analyzing..." : "Analyze this trade"}
            </button>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {result && (
            <div className="rounded-xl border border-pitch-700 bg-pitch-950/60 p-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`inline-flex px-3 py-1 rounded-md border text-xs font-bold tracking-[0.15em] ${VERDICT_STYLE[result.verdict].cls}`}
                >
                  {VERDICT_STYLE[result.verdict].label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-wider text-gray-600 uppercase">Fairness</span>
                  <div className="w-24 h-2 rounded-full bg-pitch-800 border border-pitch-700 overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${result.fairness * 10}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-gray-400">{result.fairness}/10</span>
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-100">{result.summary}</p>
              <p className="text-sm text-gray-400 leading-relaxed">{result.reasoning}</p>
              {result.lineupImpact && (
                <p className="text-xs text-gray-500 leading-relaxed border-t border-pitch-700/50 pt-3">
                  {result.lineupImpact}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={copyShare}
                  className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider text-gray-300 border border-pitch-600 hover:border-accent-strong/60 hover:text-accent rounded-lg px-3 py-2 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                  {copied ? "Link copied" : "Share verdict"}
                </button>
                <Link
                  href={shareUrl}
                  target="_blank"
                  className="text-xs text-gray-600 hover:text-gray-400 underline underline-offset-2"
                >
                  Preview
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
