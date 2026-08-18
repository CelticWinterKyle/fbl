// GET /api/og/site
// 1200x630 link-preview card for the site itself. Static: no params, no user
// data, so it caches hard and is safe as a public route. This is what shows up
// when someone texts leagueblitz.app into a league group chat.

import { ImageResponse } from "next/og";

export const runtime = "edge";

const AMBER = "#fbbf24";
const BONE = "#f0ede6";
const GRAY = "#9ca3af";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#07080d",
          backgroundImage: "linear-gradient(160deg, #14161f 0%, #07080d 60%)",
          color: BONE,
          padding: "64px 76px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 62,
              height: 62,
              borderRadius: 14,
              backgroundColor: AMBER,
              color: "#07080d",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.02em",
            }}
          >
            LB
          </div>
          <div
            style={{
              fontSize: 27,
              fontWeight: 800,
              letterSpacing: "0.22em",
              color: BONE,
            }}
          >
            LEAGUE BLITZ
          </div>
        </div>

        {/* The line that has to earn the tap */}
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <div
            style={{
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              maxWidth: 940,
            }}
          >
            Every league you&apos;re in, on one screen.
          </div>
          <div style={{ display: "flex", width: 132, height: 7, backgroundColor: AMBER }} />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            fontSize: 26,
          }}
        >
          <div style={{ display: "flex", color: GRAY, letterSpacing: "0.1em" }}>
            YAHOO · SLEEPER · ESPN
          </div>
          <div style={{ display: "flex", color: AMBER, fontWeight: 700 }}>leagueblitz.app</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
