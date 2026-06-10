export const dynamic = "force-dynamic";

export const metadata = { title: "Welcome | League Blitz" };

import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isOnboardingComplete } from "@/lib/tokenStore/index";
import { Zap, Bot, BarChart3 } from "lucide-react";
import Logo from "@/components/Logo";

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
      {/* Logo */}
      <div className="mb-8">
        <Logo className="h-28 w-auto text-accent" />
      </div>

      <h1 className="font-display text-5xl md:text-7xl tracking-[0.08em] text-white mb-4 leading-none">
        WELCOME,<br />
        <span className="text-accent">{firstName.toUpperCase()}.</span>
      </h1>

      <p className="text-gray-400 text-lg max-w-lg mb-4 leading-relaxed mt-6">
        League Blitz is your personal hub for all your fantasy football leagues.
      </p>
      <p className="text-gray-500 text-base max-w-md mb-12 leading-relaxed">
        Connect your Yahoo, Sleeper, and ESPN leagues in one place, then watch everything come together on Game Day.
      </p>

      {/* Feature highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full mb-12">
        {[
          { icon: Zap,       label: "Live Scores", sub: "All leagues, one screen" },
          { icon: Bot,       label: "AI Analysis", sub: "Matchup breakdowns" },
          { icon: BarChart3, label: "Rankings",    sub: "Power rankings & awards" },
        ].map((f) => {
          const Icon = f.icon;
          return (
          <div key={f.label} className="bg-pitch-900 border border-pitch-700/50 rounded-xl p-4">
            <Icon className="w-5 h-5 text-accent mb-1.5" />
            <div className="font-bold text-white text-sm">{f.label}</div>
            <div className="text-xs text-gray-500 mt-0.5">{f.sub}</div>
          </div>
          );
        })}
      </div>

      <Link
        href="/onboarding"
        className="inline-flex items-center gap-2 bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-4 px-10 rounded-lg text-sm tracking-wider transition-colors"
      >
        SET UP YOUR LEAGUES
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </Link>

      <p className="mt-5 text-sm text-gray-600">
        Rather skip the intro?{" "}
        <Link href="/onboarding" className="text-accent-strong hover:text-accent transition-colors font-semibold">
          Jump to setup
        </Link>
      </p>
    </div>
  );
}
