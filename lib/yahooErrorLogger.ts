/**
 * Enhanced error logging for Yahoo API debugging
 */

export interface YahooErrorContext {
  userId?: string;
  endpoint?: string;
  method?: string;
  headers?: Record<string, string>;
  tokenInfo?: {
    hasToken: boolean;
    tokenPreview?: string;
    expiresAt?: number;
    isExpired?: boolean;
  };
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  errorType: 'auth' | 'api' | 'network' | 'parsing' | 'unknown';
}

export function logYahooError(error: unknown, context: YahooErrorContext) {
  const timestamp = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  
  const logEntry = {
    timestamp,
    level: 'error',
    service: 'yahoo-api',
    error: {
      message: errorMessage,
      stack: errorStack,
      type: context.errorType
    },
    context: {
      ...context,
      // Sanitize sensitive data
      tokenInfo: context.tokenInfo ? {
        ...context.tokenInfo,
        tokenPreview: context.tokenInfo.tokenPreview?.replace(/./g, '*')
      } : undefined
    }
  };
  
  // Log to console with structured format
  console.error(`[YAHOO_ERROR] ${context.errorType.toUpperCase()}:`, JSON.stringify(logEntry, null, 2));
  
  // In production, you might want to send this to an external service
  // like Sentry, LogRocket, or a custom logging endpoint
  
  return logEntry;
}

export function logYahooSuccess(data: any, context: Partial<YahooErrorContext>) {
  const timestamp = new Date().toISOString();
  
  const logEntry = {
    timestamp,
    level: 'info',
    service: 'yahoo-api',
    message: 'Yahoo API request successful',
    context: {
      ...context,
      dataSize: JSON.stringify(data).length,
      // Don't log full data, just metadata
      dataKeys: typeof data === 'object' && data ? Object.keys(data) : []
    }
  };
  
  console.log(`[YAHOO_SUCCESS] ${context.endpoint || 'unknown'}:`, JSON.stringify(logEntry, null, 2));
  
  return logEntry;
}
