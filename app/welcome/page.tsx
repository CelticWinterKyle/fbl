export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import Link from 'next/link';
import LeagueGate from './LeagueGate';

export default function WelcomePage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-8 text-center px-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Welcome to Family Business League</h1>
        <p className="text-gray-400 max-w-xl mx-auto">Connect your Yahoo account, pick your league, and then jump into your personalized dashboard with live matchups, standings, rosters, and AI insights.</p>
      </div>
      <div className="bg-gray-900/60 border border-gray-700 rounded-lg px-6 py-5 flex flex-col gap-4 w-full max-w-md shadow">
        <h2 className="text-lg font-semibold">Step 1: Connect Yahoo</h2>
        <p className="text-sm text-gray-400">Use the "Connect Yahoo" button in the top-right corner to authenticate with Yahoo Fantasy Sports.</p>
        <p className="text-xs text-gray-500">After connecting, select your league below and continue.</p>
      </div>
  <LeagueGate />
    </div>
  );
}
