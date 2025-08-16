export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
import React from "react";
import MatchupCard from "./MatchupCard";
import Card from "@/components/Card";
import PlaceholderRosters from "@/components/PlaceholderRosters";
import MessageBoard from "@/components/MessageBoard";
import AnalyzeMatchup from "@/components/AnalyzeMatchup";
import { Trophy, ChevronRight, CalendarDays, RefreshCw } from "lucide-react";
import Link from "next/link";
import championsData from "@/data/champions.json";
import scoreboard from "@/data/scoreboard.json";
import rosters from "@/data/rosters.json";
import standings from "@/data/standings.json";
import settings from "@/data/settings.json";
import commishLines from "@/data/commishLines.json";

export default function DashboardDemo() {
  const week = scoreboard[0]?.week || 1;
  const matchups = scoreboard[0]?.matchups || [];

  // Helper to get roster for a team
  function getRoster(teamName: string) {
    return rosters.find((t: any) => t.team === teamName)?.roster || [];
  }
  // Helper to sum points for a team
  function sumPoints(roster: any[]) {
    return roster.reduce((sum, p) => sum + (typeof p.points === 'number' ? p.points : 0), 0);
  }

  return (
    <div className="space-y-6">
      {/* Toggle to live dashboard */}
      <div className="flex justify-end mb-2">
        <Link href="/dashboard">
          <button className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-1.5 rounded text-sm">Switch to Live Dashboard</button>
        </Link>
      </div>

  {/* Title row */}
  <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Family Business League</h1>
        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-lg border border-gray-700/70 bg-gray-900 px-3 py-1.5 text-sm hover:bg-gray-800 flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Week {week}
          </button>
          <form action="" className="inline-block">
            <button className="rounded-lg border border-gray-700/70 bg-gray-900 p-2 hover:bg-gray-800" formAction="">
              <RefreshCw className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Scoreboard */}
          <Card
            title="Scoreboard"
            action={<span className="text-xs text-blue-300 flex items-center gap-1">All matchups <ChevronRight className="h-3 w-3" /></span>}
          >
            {matchups.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {matchups.map((m, i) => {
                  const aRoster = getRoster(m.a).filter((p: any) => p.position !== 'BN' && p.position !== 'IR');
                  const bRoster = getRoster(m.b).filter((p: any) => p.position !== 'BN' && p.position !== 'IR');
                  const aTotal = sumPoints(aRoster);
                  const bTotal = sumPoints(bRoster);
                  return (
                    <MatchupCard
                      key={i}
                      a={m.a}
                      b={m.b}
                      aRoster={aRoster}
                      bRoster={bRoster}
                      aTotal={aTotal}
                      bTotal={bTotal}
                      week={week}
                      AnalyzeMatchup={AnalyzeMatchup}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-gray-300">No matchups yet.</div>
            )}
          </Card>

          {/* Latest News / Commish Updates */}
          <Card title="Latest News" subtitle="Commish Updates">
            <ul className="list-disc ml-5 space-y-1 text-sm">
              {commishLines.map((line, i) => (
                <li key={i} className="text-gray-300">{line}</li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Standings */}
          <Card title="Standings">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-700">
                  <th className="py-2">Team</th>
                  <th>W</th>
                  <th>L</th>
                  <th>PF</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-gray-700 last:border-0">
                    <td className="py-2">{r.name}</td>
                    <td>{r.w}</td>
                    <td>{r.l}</td>
                    <td>{r.pf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* At a Glance */}
          <Card title="At a Glance">
            <ul className="text-sm space-y-1 text-gray-300">
              <li>Season: {settings.season}</li>
              <li>Scoring: {settings.scoring}</li>
              <li>Trade deadline: {settings.tradeDeadline}</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="League Activity" subtitle="Recent adds, drops, and trades">
          <div className="rounded-lg border border-dashed border-gray-800 bg-gray-950 p-6 text-center text-gray-400">
            No activity yet (demo)
          </div>
        </Card>
            <Card title="Trophy Case" subtitle="Champions and records">
              <ul className="space-y-2">
                <li className="flex items-center gap-3 text-sm text-gray-300"><Trophy className="h-5 w-5 text-amber-300" /><span className="font-semibold">2024:</span> <span>Hangin with Mahomey (Cody)</span></li>
                <li className="flex items-center gap-3 text-sm text-gray-300"><Trophy className="h-5 w-5 text-amber-300" /><span className="font-semibold">2023:</span> <span>Wonder Mom (Kristen)</span></li>
                <li className="flex items-center gap-3 text-sm text-gray-300"><Trophy className="h-5 w-5 text-amber-300" /><span className="font-semibold">2022:</span> <span>E The Machine (Erin)</span></li>
                <li className="flex items-center gap-3 text-sm text-gray-300"><Trophy className="h-5 w-5 text-amber-300" /><span className="font-semibold">2021:</span> <span>Celtic Winter (Kyle)</span></li>
                <li className="flex items-center gap-3 text-sm text-gray-300"><Trophy className="h-5 w-5 text-amber-300" /><span className="font-semibold">2020:</span> <span>Pacheck ✅ (Colton)</span></li>
                <li className="flex items-center gap-3 text-sm text-gray-300"><Trophy className="h-5 w-5 text-amber-300" /><span className="font-semibold">2019:</span> <span>The Power of Oz (Jon Oslowski)</span></li>
              </ul>
            </Card>
      </div>

      {/* Placeholder Rosters */}
      <div className="mt-8">
        <PlaceholderRosters />
      </div>

      {/* Message Board */}
      <div className="mt-8">
        <MessageBoard />
      </div>
    </div>
  );
}
