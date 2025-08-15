import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";

/** Returns an authed client with the OAuth2 user token applied. */
export async function getYahooAuthed() {
  const access = await getValidAccessToken();
  if (!access || !access.access_token) {
    return { yf: null as any, access: null as any };
  }

  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );

  // IMPORTANT: apply OAuth2 token explicitly (prevents OAuth1 fallback)
  yf.setUserToken(access.access_token);

  return { yf, access };
}

/** Legacy helper (kept if anything still imports it) */
export function getYahoo(accessToken: string) {
  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );
  yf.setUserToken(accessToken);
  return yf;
}
