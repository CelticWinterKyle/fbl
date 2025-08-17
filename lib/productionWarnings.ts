/**
 * ⚠️ PRODUCTION DEPLOYMENT WARNING ⚠️
 * 
 * This app is currently configured for local development only.
 * For production deployment on Vercel (familybizfootball.com), you need:
 * 
 * 1. PERSISTENT STORAGE:
 *    - Current token storage uses file system which doesn't persist on Vercel
 *    - Users will need to re-authenticate every time
 *    - Recommended: Migrate to Vercel KV, Postgres, or external database
 * 
 * 2. ENVIRONMENT VARIABLES (Set in Vercel Dashboard):
 *    - YAHOO_CLIENT_ID=your_yahoo_client_id
 *    - YAHOO_CLIENT_SECRET=your_yahoo_client_secret  
 *    - PUBLIC_BASE_URL=https://familybizfootball.com
 *    - OPENAI_API_KEY=your_openai_key
 *    - NODE_ENV=production
 * 
 * 3. YAHOO OAUTH CALLBACK:
 *    - Update Yahoo app settings to allow:
 *    - https://familybizfootball.com/api/yahoo/callback
 * 
 * 4. COOKIE SECURITY:
 *    - Cookies will use secure=true in production (HTTPS required)
 * 
 * Current Status: ❌ Not production ready
 * File storage will cause authentication loss on each serverless function restart.
 */

// Environment detection
export const isVercel = () => process.env.VERCEL === '1';
export const isProduction = () => process.env.NODE_ENV === 'production';

// Check if running in production with file-based storage (problematic)
export const hasProductionStorageIssue = () => {
  return isVercel() && !process.env.KV_URL; // No KV configured
};

// Log production warnings
if (hasProductionStorageIssue()) {
  console.warn(`
⚠️  PRODUCTION STORAGE WARNING ⚠️
Running on Vercel without persistent storage!
Yahoo tokens and user data will be lost between function invocations.
Users will need to re-authenticate frequently.

Recommended solutions:
1. Set up Vercel KV: npm install @vercel/kv
2. Use Vercel Postgres
3. Use external database (Supabase, PlanetScale)
  `);
}

export default {
  isVercel,
  isProduction,
  hasProductionStorageIssue,
};
