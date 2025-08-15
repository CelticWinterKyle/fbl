import YahooFantasy from "yahoo-fantasy";
import { getValidAccessToken } from "./tokenStore";

export async function getYahooAuthed() {
  const access = await getValidAccessToken();
  if (!access) return { yf: null as any, access: null as any };
  const yf: any = new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!,
    access
  );
  return { yf, access };
}

export function getYahoo(accessToken: string) {
  return new YahooFantasy(
    process.env.YAHOO_CLIENT_ID!,
    process.env.YAHOO_CLIENT_SECRET!,
    accessToken
  );
}
