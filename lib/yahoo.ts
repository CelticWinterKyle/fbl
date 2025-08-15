import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";

export async function getYahooAuthed() {
  const token = await getValidAccessToken(); // returns string | null
  if (!token) return { yf: null as any, access: null as any };

  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );
  // Apply OAuth2 bearer token (prevents OAuth1 fallback)
  yf.setUserToken(token);

  return { yf, access: token };
}

// Legacy helper
export function getYahoo(accessToken: string) {
  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!
  );
  yf.setUserToken(accessToken);
  return yf;
}
