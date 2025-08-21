export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import YahooAuth from '@/components/YahooAuth';
import Link from 'next/link';
import LeagueGate from './LeagueGate';

export default function WelcomePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  // Check if this is a post-OAuth callback
  const isPostOAuth = searchParams.auth === 'success';
  
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="max-w-4xl mx-auto px-4 py-8 flex-1">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to Family Business League
          </h1>
          <p className="text-xl text-gray-600">
            Connect your Yahoo Fantasy Football league to get started
          </p>
        </div>

        {isPostOAuth ? (
          <div className="max-w-2xl mx-auto">
            <YahooAuth />
          </div>
        ) : (
          <div className="text-center mb-8">
            <p className="text-lg text-gray-700 mb-4">
              Click "Connect Yahoo" in the top-right corner to authenticate with Yahoo Fantasy Sports
            </p>
            <div className="inline-block bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800">
                ↗️ Look for the authentication button in the header above
              </p>
            </div>
          </div>
        )}
        
        <LeagueGate />
      </div>
    </div>
  );
}
