export type Team = {
  id: string; name: string; owner: string;
  record: { w: number; l: number };
  pointsFor: number; pointsAgainst: number;
};
export type Matchup = { home: string; away: string; homeScore: number; awayScore: number };
export type Week = { week: number; matchups: Matchup[] };
export type Trade = { id: string; from: string; to: string; assetsFrom: string[]; assetsTo: string[]; status: 'proposed'|'accepted'|'rejected' };
export type News = { id: string; date: string; title: string; body: string };
export type Settings = { leagueName: string; season: number; scoring: string; tradeDeadlineWeek: number };
export type LeagueData = {
  settings: Settings;
  teams: Team[];
  schedule: Week[];
  trades: Trade[];
  news: News[];
};
