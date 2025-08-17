import { NextResponse } from 'next/server';
import { validateYahooEnvironment } from '@/lib/envCheck';
import { readTokens } from '@/lib/tokenStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const envValidation = validateYahooEnvironment();
  const tokens = readTokens();
  const hasTokens = !!(tokens?.access_token && tokens?.refresh_token);
  
  const health = {
    ok: true,
    timestamp: new Date().toISOString(),
    environment: {
      yahoo_configured: envValidation.valid,
      missing_vars: envValidation.missing,
      config_errors: envValidation.errors,
      skip_yahoo: process.env.SKIP_YAHOO === '1'
    },
    authentication: {
      has_tokens: hasTokens,
      token_expired: tokens?.expires_at ? Date.now() > tokens.expires_at : null,
      has_refresh_token: !!tokens?.refresh_token
    },
    status: envValidation.valid && hasTokens ? 'healthy' : 'degraded'
  };
  
  const statusCode = health.status === 'healthy' ? 200 : 503;
  
  return NextResponse.json(health, { status: statusCode });
}
