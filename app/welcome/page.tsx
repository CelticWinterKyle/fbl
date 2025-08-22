export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import Link from 'next/link';
import LeagueGate from './LeagueGate';
import PostOAuthHandler from './PostOAuthHandler';

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
          <PostOAuthHandler />
        ) : (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                  Connect Your Yahoo Fantasy League
                </h2>
                <p className="text-gray-600 mb-6">
                  Authenticate with Yahoo Fantasy Sports to access your league data
                </p>
              </div>
              
              <a 
                href="/api/yahoo/login"
                className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors duration-200 text-lg"
              >
                Connect Yahoo Fantasy Sports
              </a>
              
              <div className="mt-6 text-sm text-gray-500">
                <p>You'll be redirected to Yahoo to sign in securely</p>
              </div>
            </div>
          </div>
        )}
        
        <LeagueGate />
      </div>
    </div>
  );
}
