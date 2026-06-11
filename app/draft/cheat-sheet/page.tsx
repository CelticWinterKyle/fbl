import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PrintButton from "./PrintButton";

export const metadata: Metadata = {
  title: "Printable Draft Cheat Sheet | League Blitz",
  description:
    "A free, clean fantasy football cheat sheet: tier boxes to fill with your own rankings plus a round-by-round draft tracker. Print it and mark it up at the table.",
};

const TIERS = [1, 2, 3, 4, 5, 6, 7, 8];
const ROWS_PER_TIER = 5;
const ROUNDS = 16;

export default function CheatSheetPage() {
  return (
    <div className="max-w-3xl mx-auto pb-10">
      {/* Screen-only chrome */}
      <div className="print:hidden">
        <Link href="/draft" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Draft Kit
        </Link>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-2">
          <h1 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-white">
            PRINTABLE CHEAT SHEET
          </h1>
          <PrintButton />
        </div>
        <p className="text-gray-400 mb-8 max-w-xl">
          Fill the tier boxes with your own rankings the night before (any source you trust), then
          cross names off at the table. Tiers tell you when to wait and when to pounce. The round
          tracker keeps your roster shape honest.
        </p>
      </div>

      {/* The sheet: dark on screen, ink-friendly in print */}
      <div className="cheat-sheet rounded-2xl border border-pitch-700 bg-pitch-900 p-6 print:border-0 print:bg-white print:text-black print:p-0 print:rounded-none">
        <div className="flex items-center justify-between border-b border-pitch-700 print:border-gray-300 pb-3 mb-5">
          <span className="font-display text-2xl tracking-[0.1em] text-white print:text-black">
            DRAFT CHEAT SHEET
          </span>
          <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-gray-500 print:text-gray-600">
            leagueblitz.app
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          {TIERS.map((tier) => (
            <div key={tier}>
              <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-accent print:text-black mb-1.5">
                Tier {tier}
              </p>
              {Array.from({ length: ROWS_PER_TIER }).map((_, i) => (
                <div
                  key={i}
                  className="border-b border-pitch-700 print:border-gray-400 h-6"
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-8">
          <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-accent print:text-black mb-2">
            My draft, round by round
          </p>
          <div className="grid grid-cols-2 gap-x-6">
            {[0, 1].map((col) => (
              <div key={col}>
                {Array.from({ length: ROUNDS / 2 }).map((_, i) => {
                  const round = col * (ROUNDS / 2) + i + 1;
                  return (
                    <div key={round} className="flex items-center gap-2 h-7 border-b border-pitch-700 print:border-gray-400">
                      <span className="font-mono text-[10px] text-gray-500 print:text-gray-600 w-7 shrink-0">
                        R{round}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-[10px] text-gray-600 print:text-gray-500">
          Tip: take your kicker and defense in the last two rounds. Track every league you play at
          leagueblitz.app, free.
        </p>
      </div>
    </div>
  );
}
