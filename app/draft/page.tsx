// ─── /draft: public draft-kit hub ─────────────────────────────────────────────
// SEASON_FEATURES_PLAN.md #5: acquisition content for the July-August window
// when leagues form and draft. Strategy evergreens + a printable cheat sheet;
// deliberately NO player rankings (they rot and we have no edge there).

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ListOrdered, Coins, Printer, MonitorSmartphone } from "lucide-react";

export const metadata: Metadata = {
  title: "Fantasy Football Draft Kit | League Blitz",
  description:
    "Free fantasy football draft prep: snake draft strategy, auction guide, and a printable cheat sheet. Then run your whole season, every league, on one dashboard.",
};

const GUIDES = [
  {
    href: "/draft/snake-strategy",
    icon: ListOrdered,
    title: "Snake Draft Strategy",
    blurb: "Tiers over rankings, position runs, and how to draft from the turn without panicking.",
  },
  {
    href: "/draft/auction-guide",
    icon: Coins,
    title: "Auction Draft Guide",
    blurb: "Budget splits, price enforcement, and the patience game that wins auction leagues.",
  },
  {
    href: "/draft/cheat-sheet",
    icon: Printer,
    title: "Printable Cheat Sheet",
    blurb: "A clean tier sheet and round tracker you can print and mark up at the table.",
  },
];

export default function DraftKitPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <header className="text-center pt-6">
        <p className="text-xs font-bold tracking-[0.25em] text-accent uppercase">Free Draft Kit</p>
        <h1 className="font-display text-5xl md:text-6xl tracking-[0.08em] text-white mt-3">
          DRAFT DAY, HANDLED
        </h1>
        <p className="text-gray-400 mt-4 max-w-xl mx-auto">
          Strategy guides that don&apos;t expire and a cheat sheet you can actually print. When the
          draft ends, League Blitz runs your season: every league, one dashboard, free.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {GUIDES.map((g) => {
          const Icon = g.icon;
          return (
            <Link
              key={g.href}
              href={g.href}
              className="rounded-2xl border border-pitch-700 bg-pitch-900 p-5 hover:border-accent-strong/50 transition-colors group"
            >
              <Icon className="w-6 h-6 text-accent mb-3" aria-hidden="true" />
              <h2 className="font-bold text-gray-100 group-hover:text-accent transition-colors">
                {g.title}
              </h2>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{g.blurb}</p>
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-accent-strong/30 bg-accent-strong/5 px-6 py-8 text-center">
        <MonitorSmartphone className="w-7 h-7 text-accent mx-auto mb-3" aria-hidden="true" />
        <h2 className="font-display text-3xl tracking-[0.08em] text-white">
          AFTER THE DRAFT, THE SEASON
        </h2>
        <p className="text-gray-400 mt-2 max-w-md mx-auto text-sm">
          Yahoo, Sleeper, and ESPN leagues on one screen. Live scores, lineup warnings on your
          phone, AI trade verdicts, and your league&apos;s all-time trophy case.
        </p>
        <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-2.5 px-7 rounded-lg tracking-wide transition-colors text-sm"
          >
            Get started free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 border border-pitch-600 hover:border-accent-strong/60 text-gray-300 hover:text-accent font-bold py-2.5 px-6 rounded-lg tracking-wide transition-colors text-sm"
          >
            See it in action
          </Link>
        </div>
      </div>
    </div>
  );
}
