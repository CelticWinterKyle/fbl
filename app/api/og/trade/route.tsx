// GET /api/og/trade?verdict=&fairness=&give=&get=
// 1200x630 share card for a trade verdict. Display-only: draws exactly what
// is in the URL and fetches no user data, so it is safe as a public route.

import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

function clean(v: string | null, fallback: string, max = 120): string {
  const s = (v ?? "").trim();
  if (!s) return fallback;
  return s.slice(0, max);
}

const VERDICT_LABEL: Record<string, string> = {
  accept: "TAKE IT",
  reject: "WALK AWAY",
  fair: "EVEN TRADE",
};
const VERDICT_COLOR: Record<string, string> = {
  accept: "#fbbf24",
  reject: "#f87171",
  fair: "#9ca3af",
};

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const verdictRaw = clean(p.get("verdict"), "fair", 10).toLowerCase();
  const verdict = verdictRaw === "accept" || verdictRaw === "reject" ? verdictRaw : "fair";
  const fairness = Math.min(10, Math.max(1, Number(clean(p.get("fairness"), "5", 2)) || 5));
  const give = clean(p.get("give"), "Side A");
  const get = clean(p.get("get"), "Side B");

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", color: "#9ca3af" }}>
            Trade Verdict
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#6b7280" }}>{`fairness ${fairness}/10`}</div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            gap: 36,
          }}
        >
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: 4,
              color: VERDICT_COLOR[verdict],
              border: `4px solid ${VERDICT_COLOR[verdict]}55`,
              borderRadius: 18,
              padding: "8px 44px",
            }}
          >
            {VERDICT_LABEL[verdict]}
          </div>

          <div style={{ display: "flex", width: "100%", gap: 28 }}>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                border: "2px solid #1e2030",
                borderRadius: 14,
                padding: "22px 26px",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#6b7280" }}>
                Gives
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: "#e5e7eb" }}>{give}</div>
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                border: "2px solid #1e2030",
                borderRadius: 14,
                padding: "22px 26px",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#6b7280" }}>
                Gets
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: "#e5e7eb" }}>{get}</div>
            </div>
          </div>
        </div>

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
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: 8, textTransform: "uppercase", color: "#f0ede6" }}>
            League Blitz
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
