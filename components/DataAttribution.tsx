// ─── Platform data attribution ────────────────────────────────────────────────
//
// The Yahoo Fantasy API Access and Use Agreement (executed 2026-08-10) requires
// visible credit wherever Yahoo Fantasy data is displayed, plus a link back to
// Yahoo Fantasy. This renders that credit on every surface that shows league
// data, naming only the platforms actually on screen.
//
// NOTE: Yahoo's brand guidelines also call for their logo. That needs the
// official asset from the developer portal's brand kit; do not approximate it.
// Text credit plus the link-back is what ships until that asset is in hand.

import Link from "next/link";

type Platform = "yahoo" | "sleeper" | "espn";

const SOURCES: Record<Platform, { label: string; href: string }> = {
  yahoo: { label: "Yahoo Fantasy", href: "https://football.fantasysports.yahoo.com/" },
  sleeper: { label: "Sleeper", href: "https://sleeper.com/" },
  espn: { label: "ESPN Fantasy", href: "https://fantasy.espn.com/football/" },
};

const ORDER: Platform[] = ["yahoo", "sleeper", "espn"];

export default function DataAttribution({
  platforms,
  className = "",
}: {
  /** Platforms actually rendered on this view. Omit to credit all three. */
  platforms?: string[];
  className?: string;
}) {
  const shown = ORDER.filter(
    (p) => !platforms || platforms.length === 0 || platforms.includes(p)
  );
  if (shown.length === 0) return null;

  return (
    <p className={`text-[11px] text-gray-600 leading-relaxed ${className}`}>
      Fantasy data provided by{" "}
      {shown.map((p, i) => (
        <span key={p}>
          {i > 0 && (i === shown.length - 1 ? " and " : ", ")}
          <Link
            href={SOURCES[p].href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:text-accent underline underline-offset-2 transition-colors"
          >
            {SOURCES[p].label}
          </Link>
        </span>
      ))}
      . League Blitz is not affiliated with or endorsed by Yahoo, Sleeper, or ESPN.
    </p>
  );
}
