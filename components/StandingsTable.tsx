import { LeagueData, Team } from "@/lib/types";

function sortTeams(teams: Team[]) {
  return [...teams].sort((a,b)=> {
    if (a.record.w !== b.record.w) return b.record.w - a.record.w;
    return b.pointsFor - a.pointsFor;
  });
}

export default function StandingsTable({ data }: { data: LeagueData }) {
  const teams = sortTeams(data.teams);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b">
          <th className="py-2">Team</th><th>Owner</th><th>W</th><th>L</th><th>PF</th><th>PA</th>
        </tr>
      </thead>
      <tbody>
        {teams.map(t => (
          <tr key={t.id} className="border-b last:border-0">
            <td className="py-2">{t.name}</td>
            <td>{t.owner}</td>
            <td>{t.record.w}</td>
            <td>{t.record.l}</td>
            <td>{t.pointsFor.toFixed(1)}</td>
            <td>{t.pointsAgainst.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
