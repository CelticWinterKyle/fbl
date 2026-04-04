// Temporary diagnostic endpoint — only available when DEBUG_ROUTES=1
// Returns step-by-step diagnostics for ESPN-ONESITE token exchange (no secrets exposed)

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (process.env.DEBUG_ROUTES !== "1") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const espnToken: string = String(body.espnToken ?? "").trim();

  if (!espnToken) {
    return NextResponse.json({ error: "espnToken required" }, { status: 400 });
  }

  const diag: Record<string, unknown> = {
    tokenLength: espnToken.length,
    tokenPrefix: espnToken.slice(0, 40),
    hasPipe: espnToken.includes("|"),
    pipeIndex: espnToken.indexOf("|"),
    hasEquals: espnToken.includes("="),
    equalsIndex: espnToken.indexOf("="),
  };

  // Step 1: Try the original regex (requires pipe)
  const matchWithPipe = espnToken.match(/=([^|]+)\|/);
  diag.regexWithPipe = !!matchWithPipe;
  diag.regexWithPipeSegmentLength = matchWithPipe ? matchWithPipe[1].length : null;

  // Step 2: Try a relaxed regex — grab everything after first "=" (no pipe required)
  const matchRelaxed = espnToken.match(/=([A-Za-z0-9+/=_-]+)/);
  diag.regexRelaxed = !!matchRelaxed;
  diag.regexRelaxedSegmentLength = matchRelaxed ? matchRelaxed[1].length : null;

  // Step 3: Try to decode whichever segment we found
  const segment = (matchWithPipe?.[1] ?? matchRelaxed?.[1] ?? "").trim();
  diag.segmentToDecodeLength = segment.length;

  let decoded: Record<string, unknown> | null = null;
  let decodeError: string | null = null;

  if (segment) {
    for (const enc of ["base64url", "base64"] as const) {
      try {
        const raw = Buffer.from(segment, enc).toString("utf8");
        decoded = JSON.parse(raw);
        diag.decodeMethod = enc;
        diag.decodedKeys = Object.keys(decoded as object);
        diag.hasRefreshToken = "refresh_token" in (decoded as object);
        diag.hasAccessToken = "access_token" in (decoded as object);
        diag.hasIdToken = "id_token" in (decoded as object);
        break;
      } catch (e) {
        decodeError = String(e);
      }
    }
    if (!decoded) {
      diag.decodeError = decodeError;
    }
  }

  // Step 4: If we have a refresh_token, call Disney and report status + response keys
  if (decoded && (decoded as Record<string, unknown>).refresh_token) {
    const refreshToken = (decoded as Record<string, unknown>).refresh_token as string;
    diag.refreshTokenLength = refreshToken.length;

    try {
      const resp = await fetch(
        "https://registerdisney.go.com/jgc/v6/client/ESPN-ONESITE.WEB-PROD/guest/refresh-auth",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
          cache: "no-store",
        }
      );
      diag.disneyStatus = resp.status;
      diag.disneyOk = resp.ok;

      if (resp.ok) {
        const respBody = await resp.json();
        diag.disneyTopLevelKeys = Object.keys(respBody ?? {});
        diag.disneyDataKeys = Object.keys(respBody?.data ?? {});
        diag.disneyDataTokenKeys = Object.keys(respBody?.data?.token ?? {});
        diag.hasS2 = !!(respBody?.data?.s2);
        diag.hasSwid = !!(respBody?.data?.token?.swid);
      } else {
        const errText = await resp.text().catch(() => "");
        diag.disneyErrorPreview = errText.slice(0, 200);
      }
    } catch (e) {
      diag.disneyFetchError = String(e);
    }
  } else if (decoded) {
    diag.note = "Decoded JSON found but no refresh_token key — may need access_token flow instead";

    // Step 4b: Try calling refresh-auth with the access_token if present
    const accessToken = (decoded as Record<string, unknown>).access_token as string | undefined;
    if (accessToken) {
      try {
        const resp = await fetch(
          "https://registerdisney.go.com/jgc/v6/client/ESPN-ONESITE.WEB-PROD/guest/refresh-auth",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accessToken }),
            cache: "no-store",
          }
        );
        diag.disneyWithAccessTokenStatus = resp.status;
        if (resp.ok) {
          const rb = await resp.json();
          diag.disneyWithAccessTokenDataKeys = Object.keys(rb?.data ?? {});
          diag.hasS2ViaAccessToken = !!(rb?.data?.s2);
        } else {
          const t = await resp.text().catch(() => "");
          diag.disneyWithAccessTokenError = t.slice(0, 200);
        }
      } catch (e) {
        diag.disneyWithAccessTokenFetchError = String(e);
      }
    }
  }

  return NextResponse.json({ ok: true, diag });
}
