// ─── Game Day Partners: non-gambling contextual affiliate ─────────────────────
//
// The revenue diversification track chosen 2026-08-18 after Phase B
// (sportsbook affiliate) went on hold: the executed Yahoo API agreement bars
// using Yahoo Materials to support gambling (docs/YAHOO_COMPLIANCE.md sec 4),
// and this stack is the June plan's "clean, no gambling dependence" line.
//
// BRIGHT LINES (inherit the spirit of docs/ODDS_MONETIZATION_PLAN.md):
//   - No sportsbooks, casinos, DFS-for-money, or anything gambling-adjacent.
//   - Placement is contextual (it is game day), never personalized from
//     Yahoo Fantasy Information (agreement 2.c.xii bars using their data for
//     advertising/targeting).
//   - Every link is labeled a partner link with the commission disclosure
//     (FTC) and carries rel="sponsored".
//
// DORMANT BY DESIGN: with PARTNERS empty, no UI renders anywhere, same as the
// odds tab without ODDS_API_KEY. To go live, fill in entries with real
// affiliate URLs (Amazon Associates tag, ShareASale/Impact deep links, etc.)
// and deploy. Keep hrefs DIRECT to the merchant: Amazon's operating agreement
// frowns on redirect cloaking, so click tracking is a sendBeacon side channel,
// never a redirect hop.

import type { LucideIcon } from "lucide-react";
import { Tv, Pizza, Shirt, Armchair } from "lucide-react";

export type Partner = {
  /** Stable id used in click-count keys; changing it orphans history. */
  id: string;
  label: string;
  tagline: string;
  href: string;
  icon: LucideIcon;
};

// LIVE 2026-08-18: Amazon Associates tag leagueblitz-20 (Kyle's account,
// approved provisionally; needs 3 qualified sales in 180 days to stick).
// Search links rather than browse nodes: node ids rot, search terms don't.
export const PARTNERS: Partner[] = [
  {
    id: "fan-gear",
    label: "Team gear and jerseys",
    tagline: "Rep your team from the couch seat",
    href: "https://www.amazon.com/s?k=nfl+team+jersey&tag=leagueblitz-20",
    icon: Shirt,
  },
  {
    id: "gameday-food",
    label: "Game day spread",
    tagline: "Wings, snacks, and grill gear for the slate",
    href: "https://www.amazon.com/s?k=game+day+snacks+party&tag=leagueblitz-20",
    icon: Pizza,
  },
  {
    id: "watch-setup",
    label: "Upgrade the watch setup",
    tagline: "TV mounts, soundbars, and the RedZone-ready living room",
    href: "https://www.amazon.com/s?k=tv+soundbar&tag=leagueblitz-20",
    icon: Tv,
  },
];

// Icons referenced here so the import stays live while PARTNERS is empty.
export const PARTNER_ICONS = { Tv, Pizza, Shirt, Armchair };

export const PARTNER_DISCLOSURE =
  "Partner links. League Blitz may earn a commission on purchases, at no cost to you.";
