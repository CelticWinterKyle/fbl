// GET /api/og/site
// 1200x630 link-preview card for the site itself. Static: no params, no user
// data, so it caches hard and is safe as a public route. This is what shows up
// when someone texts leagueblitz.app into a league group chat.
//
// It deliberately mirrors the landing hero: same mark, same Bebas Neue display
// type, same headline, same amber second line. A preview that promises one
// thing and lands on another reads as a different product.

import { ImageResponse } from "next/og";

export const runtime = "edge";

const AMBER = "#fbbf24";
const BONE = "#f0ede6";
const GRAY = "#9ca3af";

export async function GET() {
  const [bebas, mark] = await Promise.all([
    fetch(new URL("./BebasNeue.ttf", import.meta.url)).then((r) => r.arrayBuffer()),
    fetch(new URL("./mark.png", import.meta.url)).then((r) => r.arrayBuffer()),
  ]);

  const markSrc = `data:image/png;base64,${Buffer.from(mark).toString("base64")}`;

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
          // Satori's gradient parser rejects the sized/positioned radial form
          // ("1000px 520px at 50% -12%") with "Missing comma before color
          // stops", which 500s the whole card. Keep it to a plain linear.
          backgroundImage: "linear-gradient(155deg, #191c26 0%, #0b0d14 45%, #07080d 100%)",
          color: BONE,
          padding: "58px 76px",
        }}
      >
        {/* Badge, same lockup as the landing hero */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            border: "1px solid rgba(245,158,11,0.22)",
            backgroundColor: "rgba(245,158,11,0.10)",
            borderRadius: 999,
            padding: "10px 22px 10px 14px",
            alignSelf: "flex-start",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={34} height={34} style={{ borderRadius: 7 }} alt="" />
          <div
            style={{
              fontFamily: "Bebas",
              fontSize: 26,
              letterSpacing: "0.2em",
              color: AMBER,
            }}
          >
            LEAGUE BLITZ
          </div>
        </div>

        {/* The hero line, verbatim from the landing page */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Bebas",
              fontSize: 118,
              lineHeight: 1.0,
              letterSpacing: "0.04em",
              color: "#ffffff",
            }}
          >
            ONE DASHBOARD.
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Bebas",
              fontSize: 118,
              lineHeight: 1.0,
              letterSpacing: "0.04em",
              color: AMBER,
            }}
          >
            ALL YOUR LEAGUES.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            fontFamily: "Bebas",
            fontSize: 27,
            letterSpacing: "0.16em",
          }}
        >
          <div style={{ display: "flex", color: GRAY }}>YAHOO · SLEEPER · ESPN</div>
          <div style={{ display: "flex", color: AMBER }}>LEAGUEBLITZ.APP</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Bebas", data: bebas, style: "normal", weight: 400 }],
    }
  );
}
