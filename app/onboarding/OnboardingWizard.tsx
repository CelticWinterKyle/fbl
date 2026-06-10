'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ArrowLeft } from 'lucide-react';
import YahooConnectCard from '@/components/connect/YahooConnectCard';
import SleeperConnectCard from '@/components/connect/SleeperConnectCard';
import EspnConnectCard from '@/components/connect/EspnConnectCard';

type Platform = 'yahoo' | 'sleeper' | 'espn';

const PLATFORMS: { id: Platform; name: string; logo: string; color: string; desc: string }[] = [
  { id: 'yahoo',   name: 'Yahoo Fantasy',  logo: 'Y!', color: 'bg-purple-600',  desc: 'Sign in with Yahoo, we handle the rest' },
  { id: 'sleeper', name: 'Sleeper',         logo: 'S',  color: 'bg-slate-700',   desc: 'Just your username' },
  { id: 'espn',    name: 'ESPN Fantasy',    logo: 'E',  color: 'bg-[#E8002D]',   desc: 'Set up once on a computer, synced everywhere' },
];

const STEPS = ['Choose Platforms', 'Connect Leagues', 'Done'];

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
  const [completing, setCompleting] = useState(false);
  const [leavingToConnect, setLeavingToConnect] = useState(false);

  // Yahoo OAuth round-trip feedback (the login route returns to /onboarding).
  const [authNote, setAuthNote] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  // Fresh connection status fetched after a successful OAuth return, so the
  // connect cards reflect the new Yahoo connection instead of starting blank.
  const [connStatus, setConnStatus] = useState<any | null>(null);

  // Resume the wizard after the Yahoo OAuth redirect instead of restarting.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auth = params.get('auth');
    if (auth !== 'success' && auth !== 'error') return;

    setSelected((prev) => {
      const next = new Set(prev);
      next.add('yahoo');
      return next;
    });
    setStep(1);

    if (auth === 'success') {
      setAuthNote('Yahoo connected. Pick your leagues below.');
      // Leave the auth=success param in place: YahooConnectCard reads it to
      // auto-open the league picker, then strips it from the URL itself.
      fetch('/api/user/connections', { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => { if (j.ok) setConnStatus(j.connections); })
        .catch(() => {});
    } else {
      const reason = params.get('reason');
      setAuthError(
        reason === 'denied'
          ? 'Yahoo connection cancelled. You can try again whenever you like.'
          : 'We could not finish connecting Yahoo. Please try again.'
      );
      params.delete('auth');
      params.delete('reason');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

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

  // "Connect More Leagues" must also mark onboarding complete, or the soft
  // gates will bounce the user back into this wizard later.
  async function connectMoreLeagues() {
    setLeavingToConnect(true);
    try {
      await fetch('/api/user/onboarding', { method: 'POST' });
    } finally {
      router.push('/connect');
    }
  }

  const progress = step === 0 ? 0 : step === 1 ? 50 : 100;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="font-display text-4xl tracking-[0.1em] text-white mb-1">SET UP YOUR LEAGUES</h1>
        <p className="text-gray-500 text-sm">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-1" style={{ width: `${100 / STEPS.length}%` }}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-accent text-pitch-950' :
                i === step ? 'bg-accent/20 border-2 border-accent text-accent' :
                'bg-pitch-800 border border-pitch-600 text-gray-600'
              }`}>
                {i < step ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
              </div>
              <span className={`text-[10px] font-bold tracking-wider uppercase hidden sm:block ${
                i === step ? 'text-accent' : 'text-gray-600'
              }`}>{label}</span>
            </div>
          ))}
        </div>
        <div className="h-0.5 bg-pitch-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Step 0: Choose platforms ────────────────────────────────────────── */}
      {step === 0 && (
        <div>
          <p className="text-gray-400 mb-6 text-sm">
            Which platforms do you play on? Select all that apply. You can always connect more later.
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
                      ? 'border-accent/50 bg-accent/5'
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
                    active ? 'border-accent bg-accent' : 'border-pitch-600'
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
              className="bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-2.5 px-8 rounded-lg text-sm tracking-wide transition-colors"
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

          {authNote && (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-900/20 px-3 py-2.5">
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-300">{authNote}</p>
            </div>
          )}
          {authError && (
            <p className="mb-5 text-xs text-red-400 bg-red-900/20 border border-red-700/40 rounded-lg px-3 py-2.5">
              {authError}
            </p>
          )}

          <div className="space-y-5 mb-8">
            {PLATFORMS.filter((p) => selected.has(p.id)).map((p) => (
              // Remount the cards once fresh post-OAuth status arrives, since
              // they only read initialStatus on mount.
              <div key={`${p.id}-${connStatus ? 'live' : 'init'}`}>
                {p.id === 'yahoo'   && (
                  <YahooConnectCard
                    initialStatus={connStatus?.yahoo}
                    loginHref="/api/yahoo/login?return=/onboarding"
                  />
                )}
                {p.id === 'sleeper' && <SleeperConnectCard initialStatus={connStatus?.sleeper} />}
                {p.id === 'espn'    && <EspnConnectCard initialStatus={connStatus?.espn} />}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(0)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={() => setStep(2)}
              className="bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-2.5 px-8 rounded-lg text-sm tracking-wide transition-colors"
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
            <div className="absolute inset-0 bg-accent rotate-45 rounded-xl shadow-2xl shadow-accent/20" />
            <Check className="relative w-9 h-9 text-pitch-950" strokeWidth={3} />
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
              className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-soft text-pitch-950 font-bold py-3.5 px-8 rounded-lg text-sm tracking-wider transition-colors disabled:opacity-60"
            >
              {completing ? 'Loading...' : 'GO TO GAME DAY'}
              {!completing && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              )}
            </button>
            <button
              onClick={connectMoreLeagues}
              disabled={leavingToConnect}
              className="inline-flex items-center justify-center text-gray-400 hover:text-white font-semibold py-3.5 px-6 text-sm tracking-wider transition-colors disabled:opacity-60"
            >
              {leavingToConnect ? 'Loading...' : 'Connect More Leagues'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
