// GET /api/og/week?record=&leagues=&top=&topPts=&week=
// 1200x630 share card for the weekly recap. Display-only: draws exactly what
// is in the URL and fetches no user data, so it is safe as a public route.

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
  const record = clean(p.get("record"), "0-0");
  const leagues = clean(p.get("leagues"), "1");
  const top = clean(p.get("top"), "");
  const topPts = clean(p.get("topPts"), "");
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
        {/* Header */}
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
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#9ca3af",
            }}
          >
            My Week
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

        {/* Record hero */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <div style={{ fontSize: 200, fontWeight: 800, color: "#fbbf24", lineHeight: 1 }}>
            {record}
          </div>
          <div style={{ fontSize: 38, fontWeight: 600, color: "#9ca3af", marginTop: 8 }}>
            {`across ${leagues} ${leagues === "1" ? "league" : "leagues"}`}
          </div>
          {top ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 30,
                fontSize: 32,
                color: "#e5e7eb",
              }}
            >
              <div style={{ color: "#6b7280", fontWeight: 600 }}>Top player:</div>
              <div style={{ fontWeight: 800 }}>{top}</div>
              {topPts ? <div style={{ color: "#fbbf24", fontWeight: 800 }}>{`${topPts} pts`}</div> : null}
            </div>
          ) : null}
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
          <div style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: "#fbbf24" }} />
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
