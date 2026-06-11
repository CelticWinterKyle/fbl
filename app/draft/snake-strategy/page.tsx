import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Snake Draft Strategy Guide | League Blitz",
  description:
    "How to win a fantasy football snake draft: tiers over rankings, surviving position runs, drafting from the turn, and late-round strategy that actually matters.",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl tracking-[0.06em] text-white mt-10 mb-3">{children}</h2>;
}

export default function SnakeStrategyPage() {
  return (
    <article className="max-w-2xl mx-auto pb-10">
      <Link href="/draft" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 mb-6">
        <ArrowLeft className="w-3.5 h-3.5" /> Draft Kit
      </Link>

      <h1 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-white">
        SNAKE DRAFT STRATEGY
      </h1>
      <p className="text-gray-400 mt-3">
        The strategy that survives every season, every scoring format, and every hot take. None of
        this expires when a player gets hurt in August.
      </p>

      <div className="prose-invert text-gray-300 leading-relaxed space-y-4 mt-8 text-[15px]">
        <H2>Tiers beat rankings</H2>
        <p>
          A ranking says player 14 is better than player 15. A tier says players 12 through 17 are
          basically the same guy. That second statement is the useful one on draft day, because the
          question you actually face is never &quot;who is ranked higher?&quot; It is &quot;can I
          wait a round and still get someone from this group?&quot; Before your draft, take any
          rankings source you trust and draw lines where the value drops. When you are on the
          clock, you are not picking a player. You are picking from the highest tier that still has
          names in it.
        </p>
        <p>
          The corollary: when a tier has one player left and your next pick is far away, that is
          the player to take, even if it feels early. Reaching one spot inside a tier costs
          nothing. Missing the tier entirely costs a starter.
        </p>

        <H2>Position runs are a tax on panic</H2>
        <p>
          Somebody takes the third quarterback, and suddenly four more go in the next ten picks.
          That is a run, and the players taken during it are almost always taken too early. The
          discipline is simple to say and hard to do: when a run starts at a position where you
          still have tier depth, let it happen and collect the players the panickers passed over.
          Runs create value everywhere else on the board.
        </p>
        <p>
          The exception is the last chair in musical chairs. If a run is happening in a tier where
          exactly one player you need remains, take the player. Discipline means reading the board,
          not ignoring it.
        </p>

        <H2>Drafting from the turn</H2>
        <p>
          Picking first or last in the order sounds bad and mostly is not. You get two picks
          together, which means you can plan pairs instead of single players: anchor running back
          plus elite receiver, or two top receivers, whatever the board gives you. The real
          adjustment is mental. Between your pairs, twenty-plus picks happen, so draft for tiers
          that will survive the gap and never plan around one specific player making it back to
          you. He will not.
        </p>

        <H2>The middle rounds are the draft</H2>
        <p>
          Rounds five through ten decide more leagues than rounds one and two. Early picks are
          close to consensus; everyone leaves the first two rounds with roughly equal value. The
          middle rounds are where rosters separate, and the principle that separates them is
          opportunity over talent. A boring starter with a guaranteed workload beats an exciting
          backup waiting for an injury. Volume is the most predictive stat in fantasy football,
          and the middle rounds are where it is still on the board.
        </p>

        <H2>Late rounds: swing, don&apos;t reach for floor</H2>
        <p>
          The last four rounds of your draft will mostly be cut by October. Draft accordingly. A
          fourteenth-round pick with a safe twenty-touch backup role is worth less than a
          fourteenth-round pick who becomes a league winner if one thing breaks his way. You can
          find floor on waivers in week two. You cannot find upside there once everyone has seen
          it. And take your kicker and defense with your last two picks. Every round earlier than
          that is a donation to the rest of your league.
        </p>

        <H2>The only prep that matters the night before</H2>
        <p>
          Know your league&apos;s starting lineup and scoring. Two running backs or three
          receivers? Points per reception or standard? A flex or two? Scarcity lives in the lineup
          requirements, not in the player pool. Then set your tiers, pour something cold, and trust
          the board over your gut. Drafts are lost by people improvising at pick 6 of a position
          run.
        </p>
      </div>

      <div className="mt-12 rounded-2xl border border-accent-strong/30 bg-accent-strong/5 px-6 py-6 text-center">
        <p className="text-gray-300 text-sm">
          Draft done? League Blitz runs the season: every league on one screen, free.
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
