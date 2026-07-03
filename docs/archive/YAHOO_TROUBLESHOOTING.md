# Yahoo API Troubleshooting Guide

This guide helps debug common Yahoo Fantasy API issues in the Family Business League application.

## Quick Health Checks

### 1. Environment Variables
```bash
# Check if all required environment variables are set
npm run check-env

# Or manually verify:
echo "YAHOO_CLIENT_ID: ${YAHOO_CLIENT_ID:+SET}"
echo "YAHOO_CLIENT_SECRET: ${YAHOO_CLIENT_SECRET:+SET}"
echo "YAHOO_REDIRECT_URI: ${YAHOO_REDIRECT_URI:-AUTO}"
```

### 2. API Health Check
Visit `/api/health` to see overall system health, including:
- Environment configuration status
- Token availability and expiration
- Authentication status

### 3. Yahoo Debug Endpoint
Visit `/api/debug/yahoo` for detailed Yahoo API debugging info:
- Environment validation
- Token status and expiration
- Authentication test results
- Basic API connectivity test

## Common Issues and Solutions

### Issue: "Authentication failed: Access token may be expired or invalid"

**Causes:**
- Expired access token with invalid refresh token
- Incorrect client credentials
- Yahoo API service issues

**Solutions:**
1. Check environment variables are correctly set
2. Re-authenticate through Yahoo OAuth flow
3. Verify redirect URI matches Yahoo app configuration
4. Check `/api/debug/yahoo` for token status

### Issue: "Rate limit exceeded"

**Causes:**
- Too many API requests in short time period
- Multiple concurrent requests

**Solutions:**
1. Implement request throttling
2. Use caching for frequently accessed data
3. Wait before retrying requests (automatic retry with exponential backoff is implemented)

### Issue: "Access forbidden: Check API permissions"

**Causes:**
- Yahoo app doesn't have required permissions
- User hasn't granted necessary scopes
- League privacy settings

**Solutions:**
1. Verify Yahoo app has `fspt-r` (read) scope
2. Check if user is actually in the fantasy league
3. Ensure league isn't private/restricted

### Issue: Token storage failures in production

**Causes:**
- Read-only filesystem in serverless environments
- Permission issues with token directory

**Solutions:**
1. Tokens automatically fallback to `/tmp` directory in serverless
2. Set `YAHOO_TOKEN_DIR` environment variable to writable directory
3. Consider using database or Redis for token storage in production

### Issue: "No teams found" despite successful authentication

**Causes:**
- User not in any fantasy leagues for current season
- Wrong game key or season
- League permissions

**Solutions:**
1. Verify user is in active fantasy leagues
2. Check if it's the correct NFL season
3. Try different API endpoints in debug mode

## Debugging Tools

### Enable Debug Logging
Add `?debug=1` to any Yahoo API endpoint to get detailed debugging information.

### Check Token Expiration
```javascript
// In browser console or Node.js
const expiresAt = 1754931648000; // Example timestamp
const now = Date.now();
const isExpired = now > expiresAt;
const timeLeft = Math.max(0, expiresAt - now);
console.log(`Token expired: ${isExpired}, Time left: ${timeLeft}ms`);
```

### Manual Token Refresh Test
```bash
curl -X POST https://api.login.yahoo.com/oauth2/get_token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=refresh_token&refresh_token=YOUR_REFRESH_TOKEN&redirect_uri=YOUR_REDIRECT_URI"
```

## Error Codes Reference

| Error Code | Description | Action |
|------------|-------------|---------|
| `skip_flag` | Yahoo integration disabled | Check `SKIP_YAHOO` environment variable |
| `missing_env` | Missing environment variables | Set `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` |
| `env_validation_failed` | Invalid environment configuration | Run `npm run check-env` |
| `no_token` | No valid access token | Re-authenticate through OAuth |
| `auth_failed` | Authentication test failed | Check token validity and Yahoo API status |
| `no_teams_found` | User has no fantasy teams | Verify user is in active leagues |

## Production Considerations

1. **Token Storage**: Use database or Redis instead of file system
2. **Rate Limiting**: Implement application-level rate limiting
3. **Caching**: Cache frequently accessed data (teams, leagues, etc.)
4. **Monitoring**: Set up alerts for authentication failures
5. **Backup Auth**: Consider multiple OAuth apps for redundancy

## Getting Help

1. Check `/api/debug/yahoo` for current system status
2. Review server logs for detailed error messages
3. Verify Yahoo Developer Console for app status
4. Test with minimal OAuth flow to isolate issues
