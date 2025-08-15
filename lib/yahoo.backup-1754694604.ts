import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";

/**
 * Returns an authed YahooFantasy client with the OAuth2 access token applied.
 * This prevents the library from falling back to OAuth1 signatures.
 */
export async function getYahooAuthed() {
  const access = await getValidAccessToken();  // should contain access_token (string)
  if (!access || !access.access_token) {
    return { yf: null as any, access: null as any };
  }

  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );

  // IMPORTANT: apply OAuth2 token explicitly
  yf.setUserToken(access.access_token);

  return { yf, access };
}

/** Legacy helper (kept if something still imports it) */
export function getYahoo(accessToken: string) {
  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );
  yf.setUserToken(accessToken);
  return yf;
}
