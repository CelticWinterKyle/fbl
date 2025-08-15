import { NextResponse } from "next/server";
export async function GET() {
  const p = new URLSearchParams({
    client_id: process.env.YAHOO_CLIENT_ID!,
    redirect_uri: process.env.YAHOO_REDIRECT_URI!,
    response_type: "code",
    scope: "fspt-r",
  });
  return NextResponse.redirect("https://api.login.yahoo.com/oauth2/request_auth?" + p.toString());
}
