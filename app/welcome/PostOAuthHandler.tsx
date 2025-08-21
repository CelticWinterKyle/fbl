"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PostOAuthHandler() {
  const [status, setStatus] = useState<string>('Processing authentication...');
  const router = useRouter();

  useEffect(() => {
    // Clean up URL immediately
    window.history.replaceState({}, '', window.location.pathname);
    
    setStatus('Authentication successful! Refreshing page...');
    
    // Force a page reload to ensure cookies and tokens are properly loaded
    // This fixes timing issues with serverless token storage
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }, [router]);

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="text-green-600 mb-4">✅ {status}</div>
        <div className="animate-spin w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <div className="text-gray-700 text-sm">
          This page will refresh automatically to complete the setup.
        </div>
      </div>
    </div>
  );
}
