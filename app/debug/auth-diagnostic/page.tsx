"use client";
import { useEffect, useState } from "react";

type DiagnosticData = {
  timestamp: string;
  userId: string | null;
  userIdCreated: boolean;
  cookieValue: string | null;
  environment: {
    YAHOO_CLIENT_ID: boolean;
    YAHOO_CLIENT_SECRET: boolean;
    YAHOO_REDIRECT_URI: string | null;
    SKIP_YAHOO: string | null;
    VERCEL: boolean;
    NODE_ENV: string;
  };
  tokenStorage: {
    tokenDir: string;
    tokenDirExists: boolean;
    tokenFiles: Array<{
      name: string;
      size: number;
      modified: string;
    }>;
    userTokenFileExists: boolean;
    userTokenFileContent: {
      hasAccessToken: boolean;
      hasRefreshToken: boolean;
      expiresAt: string | null;
      isExpired: boolean | null;
    } | null;
  };
  tokens: {
    userTokens: {
      hasAccessToken: boolean;
      hasRefreshToken: boolean;
      expiresAt: string | null;
      isExpired: boolean | null;
    } | null;
    oauthTempTokens: {
      hasAccessToken: boolean;
      hasRefreshToken: boolean;
      expiresAt: string | null;
    } | null;
  };
  authentication: {
    reason: string | null;
    hasYf: boolean;
    hasAccess: boolean;
    accessTokenPreview: string | null;
  };
};

export default function AuthDiagnosticPage() {
  const [data, setData] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDiagnostic() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/debug/auth-diagnostic', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const diagnosticData = await response.json();
      setData(diagnosticData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDiagnostic();
  }, []);

  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Authentication Diagnostic</h1>
        <div className="text-gray-400">Loading diagnostic data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Authentication Diagnostic</h1>
        <div className="text-red-400 mb-4">Error: {error}</div>
        <button 
          onClick={loadDiagnostic}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Authentication Diagnostic</h1>
        <div className="text-red-400">No diagnostic data received</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Authentication Diagnostic</h1>
        <button 
          onClick={loadDiagnostic}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Session */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">User Session</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-gray-400">User ID:</span> {data.userId || 'None'}</div>
            <div><span className="text-gray-400">Created:</span> {data.userIdCreated ? 'Yes' : 'No'}</div>
            <div><span className="text-gray-400">Cookie Value:</span> {data.cookieValue || 'None'}</div>
            <div><span className="text-gray-400">Timestamp:</span> {new Date(data.timestamp).toLocaleString()}</div>
          </div>
        </div>

        {/* Environment */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">Environment</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-gray-400">YAHOO_CLIENT_ID:</span> {data.environment.YAHOO_CLIENT_ID ? '✅' : '❌'}</div>
            <div><span className="text-gray-400">YAHOO_CLIENT_SECRET:</span> {data.environment.YAHOO_CLIENT_SECRET ? '✅' : '❌'}</div>
            <div><span className="text-gray-400">YAHOO_REDIRECT_URI:</span> {data.environment.YAHOO_REDIRECT_URI || 'Not set'}</div>
            <div><span className="text-gray-400">SKIP_YAHOO:</span> {data.environment.SKIP_YAHOO || 'Not set'}</div>
            <div><span className="text-gray-400">VERCEL:</span> {data.environment.VERCEL ? 'Yes' : 'No'}</div>
            <div><span className="text-gray-400">NODE_ENV:</span> {data.environment.NODE_ENV}</div>
          </div>
        </div>

        {/* Token Storage */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">Token Storage</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-gray-400">Token Directory:</span> {data.tokenStorage.tokenDir}</div>
            <div><span className="text-gray-400">Directory Exists:</span> {data.tokenStorage.tokenDirExists ? '✅' : '❌'}</div>
            <div><span className="text-gray-400">User Token File:</span> {data.tokenStorage.userTokenFileExists ? '✅' : '❌'}</div>
            <div><span className="text-gray-400">Token Files:</span> {data.tokenStorage.tokenFiles.length}</div>
            {data.tokenStorage.tokenFiles.length > 0 && (
              <div className="mt-2">
                <div className="text-gray-400 mb-1">Files:</div>
                {data.tokenStorage.tokenFiles.map((file, i) => (
                  <div key={i} className="text-xs ml-2">
                    {file.name} ({file.size} bytes, {new Date(file.modified).toLocaleString()})
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Authentication Status */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">Authentication Status</h2>
          <div className="space-y-2 text-sm">
            <div><span className="text-gray-400">Reason:</span> {data.authentication.reason || 'None'}</div>
            <div><span className="text-gray-400">Has Yahoo Fantasy:</span> {data.authentication.hasYf ? '✅' : '❌'}</div>
            <div><span className="text-gray-400">Has Access Token:</span> {data.authentication.hasAccess ? '✅' : '❌'}</div>
            <div><span className="text-gray-400">Token Preview:</span> {data.authentication.accessTokenPreview || 'None'}</div>
          </div>
        </div>

        {/* User Tokens */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">User Tokens</h2>
          {data.tokens.userTokens ? (
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-400">Access Token:</span> {data.tokens.userTokens.hasAccessToken ? '✅' : '❌'}</div>
              <div><span className="text-gray-400">Refresh Token:</span> {data.tokens.userTokens.hasRefreshToken ? '✅' : '❌'}</div>
              <div><span className="text-gray-400">Expires At:</span> {data.tokens.userTokens.expiresAt ? new Date(data.tokens.userTokens.expiresAt).toLocaleString() : 'None'}</div>
              <div><span className="text-gray-400">Is Expired:</span> {data.tokens.userTokens.isExpired ? '❌ Yes' : '✅ No'}</div>
            </div>
          ) : (
            <div className="text-gray-400">No user tokens found</div>
          )}
        </div>

        {/* OAuth Temp Tokens */}
        <div className="bg-gray-800 p-4 rounded">
          <h2 className="text-lg font-semibold mb-3">OAuth Temp Tokens</h2>
          {data.tokens.oauthTempTokens ? (
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-400">Access Token:</span> {data.tokens.oauthTempTokens.hasAccessToken ? '✅' : '❌'}</div>
              <div><span className="text-gray-400">Refresh Token:</span> {data.tokens.oauthTempTokens.hasRefreshToken ? '✅' : '❌'}</div>
              <div><span className="text-gray-400">Expires At:</span> {data.tokens.oauthTempTokens.expiresAt ? new Date(data.tokens.oauthTempTokens.expiresAt).toLocaleString() : 'None'}</div>
            </div>
          ) : (
            <div className="text-gray-400">No OAuth temp tokens found</div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 bg-gray-800 p-4 rounded">
        <h2 className="text-lg font-semibold mb-3">Summary</h2>
        <div className="space-y-2 text-sm">
          <div className={`font-semibold ${data.authentication.hasAccess ? 'text-green-400' : 'text-red-400'}`}>
            Authentication Status: {data.authentication.hasAccess ? '✅ Working' : '❌ Failed'}
          </div>
          <div className="text-gray-400">
            Reason: {data.authentication.reason || 'Unknown'}
          </div>
          {!data.authentication.hasAccess && (
            <div className="text-yellow-400">
              <strong>Recommendations:</strong>
              <ul className="list-disc list-inside mt-1 ml-4">
                {!data.environment.YAHOO_CLIENT_ID && <li>Missing YAHOO_CLIENT_ID environment variable</li>}
                {!data.environment.YAHOO_CLIENT_SECRET && <li>Missing YAHOO_CLIENT_SECRET environment variable</li>}
                {!data.tokens.userTokens?.hasAccessToken && <li>No access token found - try re-authenticating with Yahoo</li>}
                {data.tokens.userTokens?.isExpired && <li>Access token is expired - refresh may have failed</li>}
                {!data.tokenStorage.userTokenFileExists && <li>User token file doesn't exist - OAuth may have failed</li>}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
