"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PostOAuthHandler() {
  const [status, setStatus] = useState<string>('Authentication successful!');
  const router = useRouter();

  useEffect(() => {
    // Clean up URL immediately
    window.history.replaceState({}, '', window.location.pathname);
    
    // Since the user reached this page, OAuth was successful
    // The header YahooAuth component will handle league selection
    setStatus('Redirecting to dashboard...');
    
    // Simple redirect after a moment
    setTimeout(() => {
      router.push('/dashboard');
    }, 2000);
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="text-green-600 mb-4">✅ {status}</div>
        <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <div className="text-gray-700">
          You can also select your league using the "Pick League" option in the top-right corner.
        </div>
      </div>
    </div>
  );
}
