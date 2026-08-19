"use client";
// ─── Game Day Partners card ───────────────────────────────────────────────────
// Renders nothing while lib/partners.ts has no entries (the dormant pattern,
// same as the odds tab without a key). When live: labeled partner links with
// the FTC disclosure, rel="sponsored", and a beacon-based click count that
// never delays the navigation.

import { PARTNERS, PARTNER_DISCLOSURE } from "@/lib/partners";
import { ExternalLink } from "lucide-react";

function recordClick(id: string) {
  try {
    const payload = JSON.stringify({ id });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/partners/click", new Blob([payload], { type: "application/json" }));
    } else {
      void fetch("/api/partners/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // A lost count must never break the click.
  }
}

export default function GameDayPartners() {
  if (PARTNERS.length === 0) return null;

  // Layout follows mockups/monetization-concepts.html concept 3: one labeled
  // module below the real content, tile per partner, never injected mid-feed.
  // The mockup's roster-personalized copy ("X is in 2 of your lineups") is
  // deliberately NOT reproduced: the Yahoo agreement (2.c.xii) bars using
  // Yahoo Fantasy Information for advertising or targeting. Time and slate
  // context is fine; roster context is not.
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">
          Partners
        </h3>
        <span className="text-[10px] text-gray-600">{PARTNER_DISCLOSURE}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PARTNERS.map((p) => {
          const Icon = p.icon;
          return (
            <a
              key={p.id}
              href={p.href}
              target="_blank"
              rel="sponsored noopener noreferrer"
              onClick={() => recordClick(p.id)}
              className="group rounded-xl border border-pitch-700 bg-pitch-900 hover:border-accent-strong/40 transition-colors p-4 flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-pitch-800 border border-pitch-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-accent" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-gray-200 group-hover:text-white transition-colors">
                  {p.label}
                </span>
              </div>
              <span className="text-xs text-gray-500 leading-relaxed flex-1">{p.tagline}</span>
              <span className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-pitch-600 bg-pitch-800/60 group-hover:border-accent-strong/50 group-hover:text-accent text-gray-400 text-[11px] font-bold tracking-wider uppercase py-2 transition-colors">
                Shop on Amazon
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
