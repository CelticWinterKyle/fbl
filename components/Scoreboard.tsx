import { LeagueData } from "@/lib/types";

export default function Scoreboard({ data, week=1 }: { data: LeagueData; week?: number }) {
  const w = data.schedule.find(x=>x.week===week) || data.schedule[0];
  const team = (id: string) => data.teams.find(t=>t.id===id)?.name ?? id;
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {w.matchups.map((m, i)=> (
        <div key={i} className="card">
          <div className="card-header">Week {w.week} Matchup</div>
          <div className="card-body flex items-center justify-between">
            <div>
              <div className="font-medium">{team(m.home)}</div>
              <div className="text-2xl">{m.homeScore.toFixed(1)}</div>
            </div>
            <span className="text-gray-400">vs</span>
            <div className="text-right">
              <div className="font-medium">{team(m.away)}</div>
              <div className="text-2xl">{m.awayScore.toFixed(1)}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
