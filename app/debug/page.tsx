export default function DebugPage() {
  return (
    <div className="p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Debug Tools</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <a 
          href="/debug/auth-diagnostic" 
          className="block p-4 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-2">Authentication Diagnostic</h2>
          <p className="text-sm text-gray-400">
            Check Yahoo OAuth status, tokens, and authentication flow
          </p>
        </a>
        
        <a 
          href="/debug/ai-logs" 
          className="block p-4 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-2">AI Logs</h2>
          <p className="text-sm text-gray-400">
            View AI prompt logs and responses
          </p>
        </a>
        
        <a 
          href="/api/debug/storage-health" 
          className="block p-4 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-2">Storage Health</h2>
          <p className="text-sm text-gray-400">
            Check file system and storage status
          </p>
        </a>
        
        <a 
          href="/api/debug/tokens" 
          className="block p-4 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-2">Token Status</h2>
          <p className="text-sm text-gray-400">
            View current token storage and status
          </p>
        </a>
        
        <a 
          href="/api/debug/user-session" 
          className="block p-4 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-2">User Session</h2>
          <p className="text-sm text-gray-400">
            Check user session and cookie status
          </p>
        </a>
        
        <a 
          href="/api/debug/yahoo" 
          className="block p-4 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
        >
          <h2 className="text-lg font-semibold mb-2">Yahoo API</h2>
          <p className="text-sm text-gray-400">
            Test Yahoo Fantasy API connectivity
          </p>
        </a>
      </div>
      
      <div className="mt-8 p-4 bg-yellow-900/20 border border-yellow-600/30 rounded">
        <h3 className="text-lg font-semibold mb-2 text-yellow-400">Troubleshooting 401 Errors</h3>
        <p className="text-sm text-gray-300 mb-3">
          If you're experiencing 401 Unauthorized errors, start with the Authentication Diagnostic tool above. 
          Common issues include:
        </p>
        <ul className="text-sm text-gray-300 space-y-1 ml-4">
          <li>• Missing or expired Yahoo OAuth tokens</li>
          <li>• Environment variables not properly configured</li>
          <li>• User session cookie issues</li>
          <li>• Token storage directory permissions</li>
        </ul>
      </div>
    </div>
  );
}
