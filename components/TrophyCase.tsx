"use client";

import React, { useEffect, useState } from "react";

type Champion = {
  season: number;
  team: string;
  owner: string;
};

type Leader = {
  name: string;
  pf?: number;
  w?: number;
  l?: number;
  label?: string;
};

type TrophyData = {
  ok: boolean;
  season: number | string;
  currentWeek: number;
  pfLeader?: Leader | null;
  recordLeader?: Leader | null;
  weeklyHigh?: { week: number; name: string; points: number } | null;
  streakLeader?: Leader | null;
  pastChampions: Champion[];
};

export default function TrophyCase() {
  const [data, setData] = useState<TrophyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/trophies")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-900 p-4 rounded-lg">
        <h3 className="font-bold text-white">Trophy Case</h3>
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="bg-slate-900 p-4 rounded-lg">
        <h3 className="font-bold text-white">Trophy Case</h3>
        <p className="text-gray-400 text-sm">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 p-4 rounded-lg">
      <h3 className="font-bold text-white">Trophy Case</h3>
      <p className="text-gray-400 text-sm mb-4">
        Champions and records
      </p>

      {/* Current Season Leaders */}
      <div className="mb-4">
        {data.pfLeader && (
          <p className="text-gray-300">
            🏆 Most Points For:{" "}
            <span className="text-white">{data.pfLeader.name}</span> (
            {data.pfLeader.pf} pts)
          </p>
        )}
        {data.recordLeader && (
          <p className="text-gray-300">
            📈 Best Record:{" "}
            <span className="text-white">{data.recordLeader.name}</span> (
            {data.recordLeader.w}-{data.recordLeader.l})
          </p>
        )}
        {data.weeklyHigh && (
          <p className="text-gray-300">
            💥 Weekly High ({data.weeklyHigh.week}):{" "}
            <span className="text-white">{data.weeklyHigh.name}</span> (
            {data.weeklyHigh.points} pts)
          </p>
        )}
        {data.streakLeader && (
          <p className="text-gray-300">
            🔥 Longest Streak:{" "}
            <span className="text-white">{data.streakLeader.name}</span> (
            {data.streakLeader.label})
          </p>
        )}
      </div>

      {/* Past Champions */}
      <h4 className="text-white font-semibold mt-4">Past Champions</h4>
      {data.pastChampions.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {data.pastChampions.map((c) => (
            <li key={c.season} className="text-gray-300">
              {c.season}:{" "}
              <span className="text-white">{c.team}</span> (
              {c.owner})
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-400 text-sm">No champions recorded yet</p>
      )}
    </div>
  );
}
