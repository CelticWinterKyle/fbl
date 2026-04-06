'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import YahooConnectCard from '@/components/connect/YahooConnectCard';
import SleeperConnectCard from '@/components/connect/SleeperConnectCard';
import EspnConnectCard from '@/components/connect/EspnConnectCard';

type Platform = 'yahoo' | 'sleeper' | 'espn';

const PLATFORMS: { id: Platform; name: string; logo: string; color: string; desc: string }[] = [
  { id: 'yahoo',   name: 'Yahoo Fantasy',  logo: 'Y!', color: 'bg-purple-600',  desc: 'OAuth — we handle the login' },
  { id: 'sleeper', name: 'Sleeper',         logo: 'S',  color: 'bg-slate-700',   desc: 'Just your username' },
  { id: 'espn',    name: 'ESPN Fantasy',    logo: 'E',  color: 'bg-[#E8002D]',   desc: 'League ID required' },
];

const STEPS = ['Choose Platforms', 'Connect Leagues', 'Done'];

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
  const [completing, setCompleting] = useState(false);

  function togglePlatform(id: Platform) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function completeOnboarding() {
    setCompleting(true);
    try {
      await fetch('/api/user/onboarding', { method: 'POST' });
    } finally {
      router.push('/gameday');
    }
  }

  const progress = step === 0 ? 0 : step === 1 ? 50 : 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white mb-1">SET UP YOUR LEAGUES</h1>
        <p className="text-gray-500 text-sm">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-1" style={{ width: `${100 / STEPS.length}%` }}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-amber-400 text-pitch-950' :
                i === step ? 'bg-amber-400/20 border-2 border-amber-400 text-amber-400' :
                'bg-pitch-800 border border-pitch-600 text-gray-600'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] font-bold tracking-wider uppercase hidden sm:block ${
                i === step ? 'text-amber-400' : 'text-gray-600'
              }`}>{label}</span>
            </div>
          ))}
        </div>
        <div className="h-0.5 bg-pitch-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Step 0: Choose platforms ────────────────────────────────────────── */}
      {step === 0 && (
        <div>
          <p className="text-gray-400 mb-6 text-sm">
            Which platforms do you play on? Select all that apply — you can always connect more later.
          </p>
          <div className="space-y-3 mb-8">
            {PLATFORMS.map((p) => {
              const active = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlatform(p.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                    active
                      ? 'border-amber-400/50 bg-amber-400/5'
                      : 'border-pitch-700 bg-pitch-900 hover:border-pitch-600'
                  }`}
                >
                  <div className={`w-10 h-10 ${p.color} rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                    {p.logo}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white text-sm">{p.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{p.desc}</div>
                  </div>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    active ? 'border-amber-400 bg-amber-400' : 'border-pitch-600'
                  }`}>
                    {active && (
                      <svg className="w-3 h-3 text-pitch-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => { setStep(2); }}
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
            >
              Skip for now
            </button>
            <button
              onClick={() => setStep(selected.size > 0 ? 1 : 2)}
              className="bg-amber-400 hover:bg-amber-300 text-pitch-950 font-bold py-2.5 px-8 rounded-lg text-sm tracking-wide transition-colors"
            >
              {selected.size > 0 ? 'Continue' : 'Skip'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Connect selected platforms ─────────────────────────────── */}
      {step === 1 && (
        <div>
          <p className="text-gray-400 mb-6 text-sm">
            Connect each platform below. You can skip any and finish connecting later on the Leagues page.
          </p>
          <div className="space-y-5 mb-8">
            {PLATFORMS.filter((p) => selected.has(p.id)).map((p) => (
              <div key={p.id}>
                {p.id === 'yahoo'   && <YahooConnectCard />}
                {p.id === 'sleeper' && <SleeperConnectCard />}
                {p.id === 'espn'    && <EspnConnectCard />}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(0)}
              className="text-sm text-gray-600 hover:text-gray-400 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(2)}
              className="bg-amber-400 hover:bg-amber-300 text-pitch-950 font-bold py-2.5 px-8 rounded-lg text-sm tracking-wide transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Done ───────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="text-center py-8">
          <div className="relative inline-flex items-center justify-center w-20 h-20 mb-8">
            <div className="absolute inset-0 bg-amber-400 rotate-45 rounded-xl shadow-2xl shadow-amber-400/20" />
            <span className="relative font-display text-3xl text-pitch-950 leading-none select-none">✓</span>
          </div>

          <h2 className="font-display text-4xl tracking-[0.1em] text-white mb-3">YOU&apos;RE SET.</h2>
          <p className="text-gray-400 mb-2 text-base max-w-md mx-auto">
            Head to Game Day to see your matchups, or visit Leagues anytime to connect more platforms.
          </p>
          <p className="text-gray-600 text-sm mb-10">
            AI analysis, live scores, and power rankings are ready whenever you are.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={completeOnboarding}
              disabled={completing}
              className="inline-flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-pitch-950 font-bold py-3.5 px-8 rounded-lg text-sm tracking-wider transition-colors disabled:opacity-60"
            >
              {completing ? 'Loading...' : 'GO TO GAME DAY'}
              {!completing && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              )}
            </button>
            <button
              onClick={() => router.push('/connect')}
              className="inline-flex items-center justify-center text-gray-400 hover:text-white font-semibold py-3.5 px-6 text-sm tracking-wider transition-colors"
            >
              Connect More Leagues
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
