// Public share page for a trade verdict. Display-only: renders exactly what
// is in the URL (no user data), with an OG image from the same params.

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowLeftRight } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

function clean(v: string | string[] | undefined, fallback: string, max = 140): string {
  const s = (Array.isArray(v) ? v[0] : v ?? "").trim();
  if (!s) return fallback;
  return s.slice(0, max);
}

function readParams(searchParams: SearchParams) {
  const verdictRaw = clean(searchParams.verdict, "fair", 10).toLowerCase();
  return {
    verdict: verdictRaw === "accept" || verdictRaw === "reject" ? verdictRaw : "fair",
    fairness: Math.min(10, Math.max(1, Number(clean(searchParams.fairness, "5", 2)) || 5)),
    give: clean(searchParams.give, "Side A"),
    get: clean(searchParams.get, "Side B"),
    summary: clean(searchParams.summary, ""),
  };
}

const VERDICT_LABEL: Record<string, string> = {
  accept: "TAKE IT",
  reject: "WALK AWAY",
  fair: "EVEN TRADE",
};

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const p = readParams(searchParams);
  const title = `Trade verdict: ${VERDICT_LABEL[p.verdict]}`;
  const description = `${p.give} for ${p.get}. Fairness ${p.fairness}/10.`;
  const og = new URLSearchParams({
    verdict: p.verdict,
    fairness: String(p.fairness),
    give: p.give,
    get: p.get,
  });
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: `/api/og/trade?${og.toString()}`, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
  };
}

export default function ShareTradePage({ searchParams }: { searchParams: SearchParams }) {
  const p = readParams(searchParams);
  const verdictCls =
    p.verdict === "accept"
      ? "border-accent-strong/50 bg-accent-strong/15 text-accent"
      : p.verdict === "reject"
        ? "border-red-700/50 bg-red-900/20 text-red-400"
        : "border-pitch-600 bg-pitch-800/60 text-gray-300";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 space-y-8">
      <div className="w-full max-w-xl rounded-2xl border border-pitch-700 bg-pitch-900 overflow-hidden shadow-xl shadow-black/40">
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-pitch-700/60">
          <span className="text-xs font-bold tracking-[0.15em] text-gray-400 uppercase inline-flex items-center gap-2">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Trade Verdict
          </span>
          <span className="font-mono text-xs text-gray-500">fairness {p.fairness}/10</span>
        </div>

        <div className="px-6 py-10 text-center space-y-6">
          <span className={`inline-flex px-4 py-1.5 rounded-md border font-display text-2xl tracking-[0.1em] ${verdictCls}`}>
            {VERDICT_LABEL[p.verdict]}
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
            <div className="rounded-xl border border-pitch-700 bg-pitch-950/50 p-4">
              <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-2">Gives</p>
              <p className="text-sm text-gray-200">{p.give}</p>
            </div>
            <div className="rounded-xl border border-pitch-700 bg-pitch-950/50 p-4">
              <p className="text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-2">Gets</p>
              <p className="text-sm text-gray-200">{p.get}</p>
            </div>
          </div>

          {p.summary && <p className="text-sm text-gray-400">{p.summary}</p>}
        </div>

        <div className="px-6 py-3 border-t border-pitch-700/60 text-center">
          <span className="text-[11px] font-bold tracking-[0.25em] text-gray-600 uppercase">League Blitz</span>
        </div>
      </div>

      <div className="text-center space-y-4">
        <p className="text-gray-400 text-sm">AI trade verdicts for every league you play.</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-accent-strong hover:bg-accent text-pitch-950 font-bold py-2.5 px-7 rounded-lg transition-colors tracking-wider text-sm"
        >
          Get started free
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </main>
  );
}
