/**
 * Environment variable validation utilities
 */

export function validateYahooEnvironment(): { valid: boolean; missing: string[]; errors: string[] } {
  const required = ['YAHOO_CLIENT_ID', 'YAHOO_CLIENT_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  const errors: string[] = [];
  
  // Check for common environment issues
  if (process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_ID.startsWith('your_')) {
    errors.push('YAHOO_CLIENT_ID appears to be a placeholder value');
  }
  
  if (process.env.YAHOO_CLIENT_SECRET && process.env.YAHOO_CLIENT_SECRET.startsWith('your_')) {
    errors.push('YAHOO_CLIENT_SECRET appears to be a placeholder value');
  }
  
  if (process.env.YAHOO_REDIRECT_URI && !process.env.YAHOO_REDIRECT_URI.startsWith('http')) {
    errors.push('YAHOO_REDIRECT_URI must be a valid URL');
  }
  
  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors
  };
}

export function logEnvironmentStatus() {
  const validation = validateYahooEnvironment();
  
  if (validation.valid) {
    console.log('✅ Yahoo environment variables are properly configured');
  } else {
    console.error('❌ Yahoo environment configuration issues:');
    if (validation.missing.length > 0) {
      console.error(`Missing variables: ${validation.missing.join(', ')}`);
    }
    if (validation.errors.length > 0) {
      validation.errors.forEach(error => console.error(`- ${error}`));
    }
  }
  
  return validation;
}
