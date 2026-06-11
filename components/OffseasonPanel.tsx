"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Link as LinkIcon, MonitorSmartphone, UserPlus, Trophy, ArrowRight, Check } from "lucide-react";

/**
 * Off-season checklist card. Rendered inside the Game Day and Dashboard empty
 * states so the app stays useful between week 17 and kickoff.
 */
export default function OffseasonPanel() {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(location.origin);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — quietly ignore.
    }
  }

  const itemClass =
    "w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-pitch-800 transition-colors group";
  const iconClass = "w-4 h-4 text-accent shrink-0";
  const labelClass = "flex-1 text-sm text-gray-300 group-hover:text-gray-100 transition-colors";
  const arrowClass = "w-3.5 h-3.5 text-gray-700 group-hover:text-accent transition-colors shrink-0";

  return (
    <div className="rounded-xl border border-pitch-700 bg-pitch-900 overflow-hidden text-left">
      <div className="px-4 py-3 border-b border-pitch-700/60">
        <h3 className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase">
          Off-Season HQ
        </h3>
      </div>
      <div className="divide-y divide-pitch-700/40">
        <Link href="/connect" className={itemClass}>
          <LinkIcon className={iconClass} />
          <span className={labelClass}>Connect every league you play in</span>
          <ArrowRight className={arrowClass} />
        </Link>
        <Link href="/connect" className={itemClass}>
          <MonitorSmartphone className={iconClass} />
          <span className={labelClass}>
            Set up ESPN one-click sync on a computer so your phone is ready for week 1
          </span>
          <ArrowRight className={arrowClass} />
        </Link>
        <button type="button" onClick={copyInvite} className={itemClass}>
          <UserPlus className={iconClass} />
          <span className={labelClass}>Invite your leaguemates, the dashboard is free</span>
          {copied ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-accent uppercase shrink-0">
              <Check className="w-3.5 h-3.5" />
              Copied
            </span>
          ) : (
            <ArrowRight className={arrowClass} />
          )}
        </button>
        <Link href="/rankings" className={itemClass}>
          <Trophy className={iconClass} />
          <span className={labelClass}>
            Relive the latest standings and your league&apos;s trophy case on the Rankings tab
          </span>
          <ArrowRight className={arrowClass} />
        </Link>
        <Link href="/draft" className={itemClass}>
          <LinkIcon className={iconClass} />
          <span className={labelClass}>Prep for draft day with the free Draft Kit</span>
          <ArrowRight className={arrowClass} />
        </Link>
      </div>
    </div>
  );
}
