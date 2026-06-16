"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users, UserPlus, Bell, Eye, Cpu, LayoutGrid,
  Activity, Clock, Server, Search, ChevronLeft,
  ChevronRight, RefreshCw, Check, X, AlertTriangle,
  Scale, Shield,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type StatsData = {
  overview: {
    totalUsers: number;
    recentSignups: number;
    pushSubscribers: number;
    oddsOpensToday: number;
    oddsOpens7d: number;
    registeredLeagues: number;
    platformBreakdown: { yahoo: number; sleeper: number; espn: number };
  };
  system: {
    crons: Record<string, { lastRun: string; ageMinutes: number; summary: string; stale: boolean } | null>;
    platformStats: Record<string, { ok: number; err: number; errorRate: number }>;
    kvHealthy: boolean;
  };
  ai: {
    today: { spent: number; limit: number; pct: number };
    last7: { date: string; spent: number }[];
  };
  generatedAt: string;
};

type UserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  imageUrl: string;
  createdAt: number;
  lastActiveAt: number | null;
  platforms: string[];
};

type UserDetail = {
  user: UserRow;
  connections: {
    yahoo: { connected: boolean; leagueCount: number };
    sleeper: { connected: boolean; username: string | null; leagueCount: number };
    espn: { connected: boolean; leagueCount: number; leagues: { leagueId: string; leagueName: string | null; season: number; health: { ok: boolean; checkedAt: number; error?: string } | null }[] };
  };
  push: {
    subscriptionCount: number;
    devices: { device?: string; addedAt: number }[];
    prefs: Record<string, boolean>;
  };
  theme: string | null;
  onboarded: boolean;
  oddsAcked: boolean;
};

type CoachData = {
  season: number;
  stats: {
    totalVerdicts: number;
    leanDistribution: Record<string, number>;
    platformBreakdown: Record<string, number>;
    scoredCount: number;
    accuracy: number | null;
  };
  verdicts: {
    hash: string;
    userId: string;
    platform: string;
    week: number;
    pick: string;
    other: string;
    lean: string;
    ts: number;
    result: { pickPts: number; otherPts: number; correct: boolean } | null;
  }[];
};

type Tab = "overview" | "users" | "system" | "ai" | "coach";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "users", label: "Users", icon: Users },
  { id: "system", label: "System", icon: Server },
  { id: "ai", label: "AI", icon: Cpu },
  { id: "coach", label: "Coach", icon: Scale },
];

const PLATFORM_COLORS: Record<string, string> = {
  yahoo: "bg-purple-600",
  sleeper: "bg-slate-600",
  espn: "bg-[#E8002D]",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string | number): string {
  const ms = typeof iso === "number" ? iso : new Date(iso).getTime();
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AdminContent() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Users state
  const [usersData, setUsersData] = useState<{ users: UserRow[]; totalCount: number } | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersOffset, setUsersOffset] = useState(0);
  const [usersQuery, setUsersQuery] = useState("");
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Coach state
  const [coachData, setCoachData] = useState<CoachData | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachWeek, setCoachWeek] = useState("");
  const [coachLean, setCoachLean] = useState("");

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setStats(data);
    } catch {} finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async (offset: number, query: string) => {
    setUsersLoading(true);
    try {
      const q = new URLSearchParams({ offset: String(offset), limit: "20" });
      if (query) q.set("query", query);
      const res = await fetch(`/api/admin/users?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setUsersData({ users: data.users, totalCount: data.totalCount });
    } catch {} finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchUserDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setUserDetail(data);
    } catch {} finally {
      setDetailLoading(false);
    }
  }, []);

  const fetchCoach = useCallback(async (week: string, lean: string) => {
    setCoachLoading(true);
    try {
      const q = new URLSearchParams();
      if (week) q.set("week", week);
      if (lean) q.set("lean", lean);
      const res = await fetch(`/api/admin/coach?${q}`, { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setCoachData(data);
    } catch {} finally {
      setCoachLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (tab === "users" && !usersData) fetchUsers(0, "");
    if (tab === "coach" && !coachData) fetchCoach("", "");
  }, [tab, usersData, coachData, fetchUsers, fetchCoach]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-accent" />
        <h1 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-white leading-none">ADMIN</h1>
        <button
          onClick={fetchStats}
          className="ml-auto p-2 text-gray-500 hover:text-accent transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${statsLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-pitch-700 -mx-6 px-6">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] px-3 md:px-4 flex items-center gap-1.5 text-xs font-bold tracking-[0.12em] uppercase whitespace-nowrap -mb-px border-b-2 transition-colors ${
                tab === t.id ? "text-white border-accent" : "text-gray-600 border-transparent hover:text-gray-400"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "overview" && stats && <OverviewTab stats={stats} />}
      {tab === "users" && (
        <UsersTab
          data={usersData}
          loading={usersLoading}
          offset={usersOffset}
          query={usersQuery}
          detail={userDetail}
          detailLoading={detailLoading}
          onSearch={(q) => { setUsersQuery(q); setUsersOffset(0); fetchUsers(0, q); }}
          onPage={(off) => { setUsersOffset(off); fetchUsers(off, usersQuery); }}
          onSelectUser={(id) => { fetchUserDetail(id); }}
          onCloseDetail={() => setUserDetail(null)}
        />
      )}
      {tab === "system" && stats && <SystemTab system={stats.system} />}
      {tab === "ai" && stats && <AITab ai={stats.ai} />}
      {tab === "coach" && (
        <CoachTab
          data={coachData}
          loading={coachLoading}
          week={coachWeek}
          lean={coachLean}
          onFilter={(w, l) => { setCoachWeek(w); setCoachLean(l); fetchCoach(w, l); }}
        />
      )}

      {statsLoading && !stats && (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      )}
    </div>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-accent" />
        <span className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">{label}</span>
      </div>
      <p className="font-display text-3xl text-white tracking-wide">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function OverviewTab({ stats }: { stats: StatsData }) {
  const { overview, system, ai } = stats;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Users" value={overview.totalUsers} />
        <StatCard icon={UserPlus} label="Last 7 Days" value={overview.recentSignups} sub="new signups" />
        <StatCard icon={Bell} label="Push Subs" value={overview.pushSubscribers} />
        <StatCard icon={Eye} label="Odds Opens" value={overview.oddsOpensToday} sub={`${overview.oddsOpens7d} this week`} />
        <StatCard icon={Cpu} label="AI Budget" value={`${ai.today.pct}%`} sub={`${fmtNum(ai.today.spent)} / ${fmtNum(ai.today.limit)}`} />
        <StatCard icon={LayoutGrid} label="Leagues" value={overview.registeredLeagues} />
      </div>

      {/* Platform breakdown */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-3">Platform Breakdown</p>
        <div className="grid grid-cols-3 gap-3">
          {(["yahoo", "sleeper", "espn"] as const).map((p) => (
            <div key={p} className="text-center">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white ${PLATFORM_COLORS[p]}`}>
                {p}
              </span>
              <p className="font-display text-2xl text-white mt-1">{overview.platformBreakdown[p]}</p>
              <p className="text-[10px] text-gray-500">leagues</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cron summary */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-3">Cron Jobs</p>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(system.crons).map(([name, beat]) => (
            <div key={name} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${beat === null ? "bg-gray-600" : beat.stale ? "bg-amber-400" : "bg-emerald-400"}`} />
              <span className="text-xs text-gray-300">{name}</span>
              <span className="text-[10px] text-gray-500 ml-auto">{beat ? relativeTime(beat.lastRun) : "never"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ──────────────────────────────────────────────────────────────

function UsersTab({
  data, loading, offset, query, detail, detailLoading,
  onSearch, onPage, onSelectUser, onCloseDetail,
}: {
  data: { users: UserRow[]; totalCount: number } | null;
  loading: boolean;
  offset: number;
  query: string;
  detail: UserDetail | null;
  detailLoading: boolean;
  onSearch: (q: string) => void;
  onPage: (offset: number) => void;
  onSelectUser: (id: string) => void;
  onCloseDetail: () => void;
}) {
  const [searchInput, setSearchInput] = useState(query);

  if (detail) {
    return <UserDetailView detail={detail} loading={detailLoading} onClose={onCloseDetail} />;
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch(searchInput)}
          placeholder="Search users..."
          className="w-full bg-pitch-800 border border-pitch-600 rounded-lg pl-10 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:border-accent-strong/60 focus:outline-none"
        />
      </div>

      {loading && <div className="text-center py-8 text-gray-500">Loading...</div>}

      {data && !loading && (
        <>
          <p className="text-xs text-gray-500">{data.totalCount} users total</p>
          <div className="space-y-2">
            {data.users.map((u) => (
              <button
                key={u.id}
                onClick={() => onSelectUser(u.id)}
                className="w-full text-left rounded-xl border border-pitch-700 bg-pitch-900 p-4 hover:border-accent-strong/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {u.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.imageUrl} alt="" className="w-8 h-8 rounded-full" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-200 truncate">
                      {[u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {u.platforms.map((p) => (
                      <span key={p} className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase text-white ${PLATFORM_COLORS[p]}`}>
                        {p.slice(0, 1)}
                      </span>
                    ))}
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-[10px] text-gray-600">Joined {relativeTime(u.createdAt)}</p>
                    {u.lastActiveAt && (
                      <p className="text-[10px] text-gray-600">Active {relativeTime(u.lastActiveAt)}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => onPage(Math.max(0, offset - 20))}
              disabled={offset === 0}
              className="min-h-[44px] px-3 flex items-center gap-1 text-xs text-gray-400 hover:text-accent disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs text-gray-600">
              {offset + 1} to {Math.min(offset + 20, data.totalCount)} of {data.totalCount}
            </span>
            <button
              onClick={() => onPage(offset + 20)}
              disabled={offset + 20 >= data.totalCount}
              className="min-h-[44px] px-3 flex items-center gap-1 text-xs text-gray-400 hover:text-accent disabled:opacity-30 transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function UserDetailView({ detail, loading, onClose }: { detail: UserDetail; loading: boolean; onClose: () => void }) {
  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const u = detail.user;
  const c = detail.connections;
  const p = detail.push;

  return (
    <div className="space-y-4">
      <button onClick={onClose} className="min-h-[44px] flex items-center gap-1 text-xs text-gray-400 hover:text-accent transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" /> Back to users
      </button>

      {/* User header */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {u.imageUrl && <img src={u.imageUrl} alt="" className="w-12 h-12 rounded-full" />}
          <div>
            <p className="text-lg font-semibold text-white">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "Unknown"}</p>
            <p className="text-sm text-gray-400">{u.email}</p>
            <p className="text-xs text-gray-600 mt-1">
              Joined {relativeTime(u.createdAt)}
              {u.lastActiveAt ? ` / Active ${relativeTime(u.lastActiveAt)}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Connections */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5 space-y-3">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">Connections</p>
        {(["yahoo", "sleeper", "espn"] as const).map((platform) => {
          const conn = c[platform];
          return (
            <div key={platform} className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white ${PLATFORM_COLORS[platform]}`}>
                {platform}
              </span>
              {conn.connected ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> {conn.leagueCount} league{conn.leagueCount !== 1 ? "s" : ""}
                  {"username" in conn && conn.username ? ` (${conn.username})` : ""}
                </span>
              ) : (
                <span className="text-xs text-gray-600">Not connected</span>
              )}
            </div>
          );
        })}

        {/* ESPN health */}
        {c.espn.leagues.length > 0 && (
          <div className="border-t border-pitch-700/50 pt-3 space-y-1">
            <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">ESPN Health</p>
            {c.espn.leagues.map((l) => (
              <div key={l.leagueId} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">{l.leagueName || l.leagueId}</span>
                {l.health ? (
                  l.health.ok ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <span className="text-red-400 flex items-center gap-1">
                      <X className="w-3 h-3" /> {l.health.error || "unhealthy"}
                    </span>
                  )
                ) : (
                  <span className="text-gray-600">no check</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Push */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5 space-y-3">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">Push Notifications</p>
        {p.subscriptionCount === 0 ? (
          <p className="text-xs text-gray-600">No subscriptions</p>
        ) : (
          <>
            <p className="text-xs text-gray-300">{p.subscriptionCount} device{p.subscriptionCount !== 1 ? "s" : ""}</p>
            <div className="flex flex-wrap gap-2">
              {p.devices.map((d, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-pitch-800 border border-pitch-600 text-[10px] text-gray-400">
                  {d.device || "Unknown"} ({relativeTime(d.addedAt)})
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(p.prefs).map(([key, on]) => (
                <span key={key} className={`px-2 py-0.5 rounded text-[10px] font-semibold ${on ? "bg-accent-strong/15 text-accent border border-accent-strong/30" : "bg-pitch-800 text-gray-600 border border-pitch-700"}`}>
                  {key}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-3">Metadata</p>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-gray-600">Theme</p>
            <p className="text-gray-300">{detail.theme || "default"}</p>
          </div>
          <div>
            <p className="text-gray-600">Onboarded</p>
            <p className={detail.onboarded ? "text-emerald-400" : "text-gray-500"}>{detail.onboarded ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-gray-600">Odds 21+</p>
            <p className={detail.oddsAcked ? "text-emerald-400" : "text-gray-500"}>{detail.oddsAcked ? "Yes" : "No"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── System Tab ─────────────────────────────────────────────────────────────

function SystemTab({ system }: { system: StatsData["system"] }) {
  return (
    <div className="space-y-6">
      {/* Cron heartbeats */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-4">Cron Heartbeats</p>
        <div className="space-y-3">
          {Object.entries(system.crons).map(([name, beat]) => (
            <div key={name} className="flex items-start gap-3 p-3 rounded-lg bg-pitch-800/50">
              <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${beat === null ? "bg-gray-600" : beat.stale ? "bg-amber-400" : "bg-emerald-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-200">{name}</p>
                  {beat?.stale && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] font-bold text-amber-400">
                      <AlertTriangle className="w-2.5 h-2.5" /> STALE
                    </span>
                  )}
                </div>
                {beat ? (
                  <>
                    <p className="text-xs text-gray-500">{relativeTime(beat.lastRun)} ({beat.ageMinutes}m)</p>
                    <p className="text-xs text-gray-600 mt-0.5">{beat.summary}</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-600">No heartbeat recorded</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Platform error rates */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-4">Platform Errors (24h)</p>
        <div className="space-y-3">
          {Object.entries(system.platformStats).map(([platform, s]) => (
            <div key={platform} className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase text-white ${PLATFORM_COLORS[platform] ?? "bg-gray-600"}`}>
                {platform}
              </span>
              <div className="flex-1 bg-pitch-800 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.errorRate > 10 ? "bg-red-400" : "bg-emerald-400"}`}
                  style={{ width: `${Math.max(2, 100 - s.errorRate)}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 w-20 text-right">
                {s.ok} ok / {s.err} err
              </span>
              <span className={`text-xs font-bold w-10 text-right ${s.errorRate > 10 ? "text-red-400" : "text-emerald-400"}`}>
                {s.errorRate}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* KV health */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5 flex items-center gap-3">
        <Activity className="w-4 h-4 text-accent" />
        <span className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase">KV Health</span>
        <span className={`ml-auto text-xs font-bold ${system.kvHealthy ? "text-emerald-400" : "text-red-400"}`}>
          {system.kvHealthy ? "Healthy" : "Unhealthy"}
        </span>
      </div>
    </div>
  );
}

// ─── AI Tab ─────────────────────────────────────────────────────────────────

function AITab({ ai }: { ai: StatsData["ai"] }) {
  const maxSpend = Math.max(...ai.last7.map((d) => d.spent), 1);

  return (
    <div className="space-y-6">
      {/* Today's budget */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-3">Today&apos;s AI Budget</p>
        <div className="flex items-end gap-3 mb-3">
          <p className="font-display text-4xl text-white">{ai.today.pct}%</p>
          <p className="text-xs text-gray-500 mb-1">{fmtNum(ai.today.spent)} / {fmtNum(ai.today.limit)} tokens</p>
        </div>
        <div className="w-full bg-pitch-800 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              ai.today.pct > 90 ? "bg-red-400" : ai.today.pct > 70 ? "bg-amber-400" : "bg-accent"
            }`}
            style={{ width: `${Math.min(100, ai.today.pct)}%` }}
          />
        </div>
      </div>

      {/* 7-day chart */}
      <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5">
        <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-4">Last 7 Days</p>
        <div className="flex items-end gap-2 h-32">
          {ai.last7.slice().reverse().map((d) => {
            const pct = maxSpend > 0 ? (d.spent / maxSpend) * 100 : 0;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] text-gray-500">{fmtNum(d.spent)}</span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    className="w-full bg-accent/60 rounded-t"
                    style={{ height: `${Math.max(2, pct)}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-600">{d.date.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Coach Tab ──────────────────────────────────────────────────────────────

function CoachTab({
  data, loading, week, lean, onFilter,
}: {
  data: CoachData | null;
  loading: boolean;
  week: string;
  lean: string;
  onFilter: (week: string, lean: string) => void;
}) {
  if (loading && !data) return <div className="text-center py-8 text-gray-500">Loading...</div>;
  if (!data) return null;

  const { stats, verdicts } = data;
  const LEAN_COLORS: Record<string, string> = {
    strong: "bg-accent-strong/15 text-accent border-accent-strong/30",
    moderate: "bg-accent-strong/10 text-accent-soft border-accent-strong/20",
    "coin flip": "bg-pitch-800 text-gray-400 border-pitch-600",
  };

  return (
    <div className="space-y-6">
      {/* Stats summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Scale} label="Total Verdicts" value={stats.totalVerdicts} />
        <StatCard icon={Activity} label="Strong" value={stats.leanDistribution.strong ?? 0} sub={`of ${stats.totalVerdicts}`} />
        <StatCard icon={Activity} label="Moderate" value={stats.leanDistribution.moderate ?? 0} />
        <StatCard icon={Activity} label="Coin Flip" value={stats.leanDistribution["coin flip"] ?? 0} />
      </div>

      {stats.scoredCount > 0 && (
        <div className="rounded-xl border border-pitch-700 bg-pitch-900 p-5 flex items-center gap-3">
          <Clock className="w-4 h-4 text-accent" />
          <span className="text-sm text-gray-300">
            Coach&apos;s Record: {stats.accuracy}% accuracy ({stats.scoredCount} graded)
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={week}
          onChange={(e) => onFilter(e.target.value, lean)}
          className="bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-accent-strong/60 focus:outline-none"
        >
          <option value="">All weeks</option>
          {Array.from({ length: 18 }, (_, i) => (
            <option key={i + 1} value={String(i + 1)}>Week {i + 1}</option>
          ))}
        </select>
        <select
          value={lean}
          onChange={(e) => onFilter(week, e.target.value)}
          className="bg-pitch-800 border border-pitch-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:border-accent-strong/60 focus:outline-none"
        >
          <option value="">All leans</option>
          <option value="strong">Strong</option>
          <option value="moderate">Moderate</option>
          <option value="coin flip">Coin flip</option>
        </select>
        {(week || lean) && (
          <button
            onClick={() => onFilter("", "")}
            className="px-3 py-2 text-xs text-gray-400 hover:text-accent transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Verdict list */}
      <div className="space-y-2">
        {verdicts.length === 0 && (
          <p className="text-center py-8 text-gray-600">No verdicts yet</p>
        )}
        {verdicts.map((v) => (
          <div key={v.hash} className="rounded-xl border border-pitch-700 bg-pitch-900 p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] font-bold tracking-[0.1em] uppercase ${LEAN_COLORS[v.lean] ?? LEAN_COLORS["coin flip"]}`}>
                {v.lean}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase text-white ${PLATFORM_COLORS[v.platform] ?? "bg-gray-600"}`}>
                {v.platform}
              </span>
              <span className="text-xs text-gray-500">Week {v.week}</span>
              <span className="text-[10px] text-gray-600 ml-auto">{relativeTime(v.ts)}</span>
            </div>
            <p className="text-sm text-gray-200 mt-2">
              Start <span className="text-accent font-semibold">{v.pick}</span>, sit {v.other}
            </p>
            {v.result && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${v.result.correct ? "text-emerald-400" : "text-red-400"}`}>
                {v.result.correct ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {v.pick} {v.result.pickPts.toFixed(1)} vs {v.other} {v.result.otherPts.toFixed(1)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
