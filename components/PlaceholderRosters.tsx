import rosters from "@/data/rosters.json";

export default function PlaceholderRosters() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      {rosters.map((team: any) => (
        <div key={team.team} className="bg-gray-950 border border-gray-800 rounded-lg p-4">
          <div className="font-bold text-lg mb-2">{team.team} <span className="text-xs text-gray-400">({team.owner})</span></div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-700">
                <th className="py-1">Player</th>
                <th>Pos</th>
                <th>Team</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {team.roster.map((p: any) => (
                <tr key={p.name} className="border-b border-gray-800 last:border-0">
                  <td className="py-1">{p.name}</td>
                  <td>{p.position}</td>
                  <td>{p.team}</td>
                  <td>{p.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
