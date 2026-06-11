import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Auction Draft Guide | League Blitz",
  description:
    "How to win a fantasy football auction draft: budget structure, price enforcement, nomination strategy, and the endgame where leagues are actually won.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl tracking-[0.06em] text-white mt-10 mb-3">{children}</h2>;
}

export default function AuctionGuidePage() {
  return (
    <article className="max-w-2xl mx-auto pb-10">
      <Link href="/draft" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Draft Kit
      </Link>

      <h1 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-white">
        AUCTION DRAFT GUIDE
      </h1>
      <p className="text-gray-400 mt-3">
        Auctions are the fairest way to draft and the easiest to lose with bad money habits. The
        principles below hold in any season and any budget.
      </p>

      <div className="text-gray-300 leading-relaxed space-y-4 mt-8 text-[15px]">
        <H2>Decide your shape before the room decides it for you</H2>
        <p>
          There are two proven builds. Stars and scrubs: spend roughly seventy percent of your
          budget on three elite players and fill the rest with one-dollar darts. Balanced: no
          player over a third of budget, strength at every slot, no holes. Both win leagues. What
          loses leagues is drifting between them mid-draft because the room got loud. Write your
          shape at the top of your sheet and let every bid answer to it.
        </p>

        <H2>Price enforcement is free money, carefully</H2>
        <p>
          When a star is about to go for under market price to someone else, one more bid forces
          them to pay fair value or hands you a discount. That is price enforcing, and it is how
          sharp auction players quietly tilt the room. The rule that keeps it safe: only enforce at
          a price you would genuinely be happy to pay. The classic auction disaster is enforcing a
          price on a player you do not want and hearing the room go silent.
        </p>

        <H2>Nominate what you don&apos;t want</H2>
        <p>
          Your nomination is not a purchase request. It is a tool for draining other budgets. Early
          on, nominate big names you have no intention of buying, especially at positions you have
          already filled or are punting. Every dollar your rivals spend on a quarterback you do not
          want is a dollar that cannot outbid you later for the receiver you do. Save your actual
          targets for the middle of the draft, after the big spenders have wounded each other.
        </p>

        <H2>Track the room&apos;s money, not just yours</H2>
        <p>
          The most valuable number in an auction is the maximum bid each opponent can still make.
          When the two biggest budgets are down to filling roster spots at a dollar each, every
          remaining player you want has exactly one realistic buyer: you. Auctions reward whoever
          is still solvent when the music slows, and that is a thing you can simply count.
        </p>

        <H2>The endgame is the whole game</H2>
        <p>
          The last third of an auction is where leagues are won, because that is when value stops
          being theoretical. Players who would have cost twenty dollars an hour earlier go for
          three to a room that is broke. Hold a real reserve, even five to ten percent of your
          budget, into the endgame, and you will buy two starters for the price of a sandwich
          while everyone else nominates kickers.
        </p>

        <H2>One dollar players decide titles</H2>
        <p>
          Your one-dollar picks should be all upside, exactly like the late rounds of a snake
          draft. Handcuffs to fragile starters, rookies one depth-chart move from a workload,
          offense-attached defenses. The safe veteran going for a dollar is going for a dollar
          because his ceiling is known and low.
        </p>
      </div>

      <div className="mt-12 rounded-2xl border border-accent-strong/30 bg-accent-strong/5 px-6 py-6 text-center">
        <p className="text-gray-300 text-sm">
          Auction done? League Blitz runs the season: every league on one screen, free.
        </p>
        <Link
          href="/sign-up"
          className="inline-flex items-center gap-2 mt-4 bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-2.5 px-7 rounded-lg tracking-wide transition-colors text-sm"
        >
          Get started free <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </article>
  );
}
