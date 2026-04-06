import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-pitch-950 text-white overflow-x-hidden -mx-6 -mt-8 px-0">

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center text-center pt-28 pb-24 px-6 overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-amber-500/5 rounded-full blur-3xl" />
          <div className="absolute top-10 left-1/4 w-[300px] h-[300px] bg-amber-400/3 rounded-full blur-2xl" />
        </div>

        {/* Badge */}
        <div className="relative mb-8 inline-flex items-center gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5">
          <div className="relative h-4 w-4 shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-amber-400 rotate-45 rounded-[2px]" />
            <span className="relative font-display text-[7px] text-pitch-950 leading-none select-none">FB</span>
          </div>
          <span className="text-xs font-bold tracking-[0.2em] text-amber-400 uppercase">Family Business League</span>
        </div>

        <h1 className="font-display text-6xl md:text-8xl tracking-[0.06em] text-white leading-none mb-6 max-w-4xl">
          ONE DASHBOARD.<br />
          <span className="text-amber-400">ALL YOUR LEAGUES.</span>
        </h1>

        <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-10 font-ui leading-relaxed">
          Yahoo, Sleeper, and ESPN fantasy leagues — unified in one place.
          Live scores, AI matchup analysis, power rankings, and your personal Game Day view.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-pitch-950 font-bold py-3.5 px-8 rounded-lg text-sm tracking-wider transition-colors"
          >
            GET STARTED FREE
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center text-gray-400 hover:text-white font-semibold py-3.5 px-6 text-sm tracking-wider transition-colors"
          >
            Sign In
          </Link>
        </div>

        {/* Dashboard preview */}
        <div className="mt-16 w-full max-w-4xl">
          <div className="relative bg-pitch-900 border border-pitch-700/60 rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-pitch-700/60 bg-pitch-900/80">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-pitch-800 rounded px-3 py-0.5 text-[11px] text-gray-500 font-mono">
                  familybizfootball.com/gameday
                </div>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { platform: "Yahoo",   league: "Family Business", score: "142.6 vs 118.3", status: "WINNING", color: "text-emerald-400" },
                { platform: "Sleeper", league: "Dynasty League",  score: "98.4 vs 110.1",  status: "LOSING",  color: "text-red-400" },
                { platform: "ESPN",    league: "Office League",   score: "134.2 vs 127.8", status: "WINNING", color: "text-emerald-400" },
              ].map((m) => (
                <div key={m.platform} className="bg-pitch-800 rounded-xl p-4 border border-pitch-700/40">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">{m.platform}</span>
                    <span className={`text-[10px] font-bold tracking-[0.15em] uppercase ${m.color}`}>{m.status}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{m.league}</p>
                  <p className="font-display text-xl text-white tracking-wide">{m.score}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PLATFORMS ─────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-pitch-700/30">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-bold tracking-[0.3em] text-amber-500/70 uppercase mb-4">Connect once. See everything.</p>
          <h2 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-white mb-12">SUPPORTED PLATFORMS</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Yahoo Fantasy", logo: "Y!", color: "bg-purple-600", desc: "Full OAuth integration. Live scores, standings, AI-powered matchup analysis." },
              { name: "Sleeper",       logo: "S",  color: "bg-slate-700",  desc: "No auth needed. Just your username. Dynasty and redraft leagues supported." },
              { name: "ESPN Fantasy",  logo: "E",  color: "bg-[#E8002D]",  desc: "Public and private leagues. Our browser extension handles private league auth." },
            ].map((p) => (
              <div key={p.name} className="bg-pitch-900 border border-pitch-700/60 rounded-xl p-6 text-left">
                <div className={`w-10 h-10 ${p.color} rounded-lg flex items-center justify-center mb-4 text-white font-bold text-sm`}>
                  {p.logo}
                </div>
                <h3 className="font-bold text-white mb-2">{p.name}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-pitch-700/30 bg-pitch-900/40">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-bold tracking-[0.3em] text-amber-500/70 uppercase mb-4">Simple setup</p>
          <h2 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-white mb-14">HOW IT WORKS</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Create an account", desc: "Sign up in seconds. Your account syncs everything across all your devices — phone, tablet, desktop." },
              { step: "02", title: "Connect your leagues", desc: "Link Yahoo, Sleeper, and ESPN leagues through our guided onboarding. Takes about two minutes." },
              { step: "03", title: "Game Day", desc: "See all your matchups on one scroll. Live scores, projections, AI analysis, power rankings — everything in one place." },
            ].map((s) => (
              <div key={s.step} className="text-left">
                <div className="font-display text-5xl text-amber-400/30 mb-3 tracking-wide">{s.step}</div>
                <h3 className="font-bold text-white text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-6 border-t border-pitch-700/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-bold tracking-[0.3em] text-amber-500/70 uppercase mb-4">What you get</p>
            <h2 className="font-display text-4xl md:text-5xl tracking-[0.08em] text-white">FEATURES</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: "⚡", title: "Live Scores",      desc: "Real-time matchup scores with active player indicators during NFL game windows." },
              { icon: "🤖", title: "AI Analysis",      desc: "GPT-powered matchup breakdowns with roster, injury, and weather context." },
              { icon: "📊", title: "Power Rankings",   desc: "PPG-based rankings with trend arrows and weekly awards across all leagues." },
              { icon: "🏈", title: "Game Day View",    desc: "Your personal matchups across every connected league on one unified screen." },
            ].map((f) => (
              <div key={f.title} className="bg-pitch-900 border border-pitch-700/40 rounded-xl p-5">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-bold text-white text-sm mb-1.5">{f.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-pitch-700/30 bg-pitch-900/40">
        <div className="max-w-2xl mx-auto text-center">
          <div className="relative mb-6 inline-flex items-center justify-center w-14 h-14">
            <div className="absolute inset-0 bg-amber-400 rotate-45 rounded-md" />
            <span className="relative font-display text-[18px] text-pitch-950 leading-none select-none">FB</span>
          </div>
          <h2 className="font-display text-5xl md:text-6xl tracking-[0.08em] text-white mb-4">READY TO PLAY?</h2>
          <p className="text-gray-400 mb-10 text-lg">Free to use. No credit card required.</p>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-pitch-950 font-bold py-4 px-10 rounded-lg text-sm tracking-wider transition-colors"
          >
            CREATE YOUR ACCOUNT
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <p className="mt-4 text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-amber-500 hover:text-amber-400 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
