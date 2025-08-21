"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PostOAuthHandler() {
  const [status, setStatus] = useState<string>('Completing authentication...');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function handlePostOAuth() {
      try {
        // Clean up URL immediately
        window.history.replaceState({}, '', window.location.pathname);
        
        setStatus('Verifying authentication...');
        
        // Wait a moment for tokens to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check auth status
        const statusRes = await fetch('/api/yahoo/status', { cache: 'no-store' });
        const statusData = await statusRes.json();
        
        if (statusData.tokenReady) {
          setStatus('Loading your leagues...');
          
          // Try to load leagues
          const leaguesRes = await fetch('/api/yahoo/user/leagues', { cache: 'no-store' });
          const leaguesData = await leaguesRes.json();
          
          if (leaguesData.ok) {
            setStatus('Success! Redirecting to dashboard...');
            // Redirect to dashboard after a brief moment
            setTimeout(() => {
              router.push('/dashboard');
            }, 1500);
          } else {
            setError('Authentication succeeded but failed to load leagues. Please try refreshing the page.');
          }
        } else {
          setError('Authentication appears to have failed. Please try connecting again.');
        }
      } catch (err) {
        console.error('Post-OAuth error:', err);
        setError('An error occurred during authentication. Please try again.');
      }
    }

    handlePostOAuth();
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="bg-white rounded-lg shadow-md p-8">
        {error ? (
          <div>
            <div className="text-red-600 mb-4">❌ {error}</div>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div>
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <div className="text-gray-700">{status}</div>
          </div>
        )}
      </div>
    </div>
  );
}
