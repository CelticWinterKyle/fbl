// GET /api/og/matchup?teamA=&teamB=&scoreA=&scoreB=&league=&week=
// Renders a 1200x630 share card. Display-only: it draws exactly what is in the
// URL and fetches no user data, so it is safe as a public route.

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

function clean(v: string | null, fallback: string): string {
  const s = (v ?? "").trim();
  if (!s) return fallback;
  return s.slice(0, 60);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const teamA = clean(p.get("teamA"), "Team A");
  const teamB = clean(p.get("teamB"), "Team B");
  const scoreA = clean(p.get("scoreA"), "0.0");
  const scoreB = clean(p.get("scoreB"), "0.0");
  const league = clean(p.get("league"), "Fantasy Football");
  const week = clean(p.get("week"), "");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#07080d",
          backgroundImage: "linear-gradient(180deg, #0d0e14 0%, #07080d 100%)",
          color: "#f0ede6",
          padding: "56px 72px",
          fontFamily: "sans-serif",
        }}
      >
        {/* League + week */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#9ca3af",
            }}
          >
            {league}
          </div>
          {week ? (
            <div
              style={{
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#fbbf24",
                border: "2px solid rgba(245, 158, 11, 0.45)",
                borderRadius: 999,
                padding: "8px 26px",
              }}
            >
              {`Week ${week}`}
            </div>
          ) : null}
        </div>

        {/* Scores */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            gap: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: "#e5e7eb",
                textAlign: "center",
                maxWidth: 440,
              }}
            >
              {teamA}
            </div>
            <div style={{ fontSize: 130, fontWeight: 800, color: "#fbbf24" }}>{scoreA}</div>
          </div>

          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              letterSpacing: 6,
              color: "#363a55",
            }}
          >
            VS
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: 40,
                fontWeight: 700,
                color: "#e5e7eb",
                textAlign: "center",
                maxWidth: 440,
              }}
            >
              {teamB}
            </div>
            <div style={{ fontSize: 130, fontWeight: 800, color: "#9ca3af" }}>{scoreB}</div>
          </div>
        </div>

        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            gap: 16,
            paddingTop: 18,
            borderTop: "2px solid #1e2030",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              backgroundColor: "#fbbf24",
            }}
          />
          <div
            style={{
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: 8,
              textTransform: "uppercase",
              color: "#f0ede6",
            }}
          >
            League Blitz
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
