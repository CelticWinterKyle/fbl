export const dynamic = "force-dynamic";

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isOnboardingComplete } from "@/lib/tokenStore/index";

export default async function WelcomePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Already onboarded — go straight to dashboard
  const done = await isOnboardingComplete(userId);
  if (done) redirect("/dashboard");

  const user = await currentUser();
  const firstName = user?.firstName ?? "Commissioner";

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-6 -mx-6 -mt-8 bg-pitch-950">
      {/* Animated diamond */}
      <div className="relative mb-10">
        <div className="relative h-20 w-20 flex items-center justify-center">
          <div className="absolute inset-0 bg-amber-400 rotate-45 rounded-lg shadow-2xl shadow-amber-400/20" />
          <span className="relative font-display text-3xl text-pitch-950 leading-none select-none">FB</span>
        </div>
      </div>

      <h1 className="font-display text-5xl md:text-7xl tracking-[0.08em] text-white mb-4 leading-none">
        WELCOME,<br />
        <span className="text-amber-400">{firstName.toUpperCase()}.</span>
      </h1>

      <p className="text-gray-400 text-lg max-w-lg mb-4 leading-relaxed mt-6">
        Family Business League is your personal hub for all your fantasy football leagues.
      </p>
      <p className="text-gray-500 text-base max-w-md mb-12 leading-relaxed">
        Connect your Yahoo, Sleeper, and ESPN leagues in one place — then watch everything come together on Game Day.
      </p>

      {/* Feature highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full mb-12">
        {[
          { icon: "🏈", label: "Live Scores", sub: "All leagues, one screen" },
          { icon: "🤖", label: "AI Analysis", sub: "Matchup breakdowns" },
          { icon: "📊", label: "Rankings",    sub: "Power rankings & awards" },
        ].map((f) => (
          <div key={f.label} className="bg-pitch-900 border border-pitch-700/50 rounded-xl p-4">
            <div className="text-xl mb-1.5">{f.icon}</div>
            <div className="font-bold text-white text-sm">{f.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{f.sub}</div>
          </div>
        ))}
      </div>

      <Link
        href="/onboarding"
        className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-pitch-950 font-bold py-4 px-10 rounded-lg text-sm tracking-wider transition-colors"
      >
        SET UP YOUR LEAGUES
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </Link>

      <p className="mt-5 text-sm text-gray-600">
        Already have your leagues set up?{" "}
        <Link href="/dashboard" className="text-amber-500 hover:text-amber-400 transition-colors font-semibold">
          Go to Dashboard
        </Link>
      </p>
    </div>
  );
}
