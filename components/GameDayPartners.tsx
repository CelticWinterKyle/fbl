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

  return (
    <div className="rounded-xl border border-pitch-700 bg-pitch-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-pitch-700/60 flex items-center justify-between gap-3">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">
          Game Day Partners
        </h3>
        <span className="text-[10px] text-gray-600">{PARTNER_DISCLOSURE}</span>
      </div>
      <div className="divide-y divide-pitch-700/40">
        {PARTNERS.map((p) => {
          const Icon = p.icon;
          return (
            <a
              key={p.id}
              href={p.href}
              target="_blank"
              rel="sponsored noopener noreferrer"
              onClick={() => recordClick(p.id)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-pitch-800 transition-colors group"
            >
              <Icon className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-gray-200 group-hover:text-white transition-colors">
                  {p.label}
                </span>
                <span className="block text-xs text-gray-600 truncate">{p.tagline}</span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-gray-700 group-hover:text-accent transition-colors shrink-0" aria-hidden="true" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
