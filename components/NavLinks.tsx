'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, UserButton } from '@clerk/nextjs';
import { useState, useEffect, useRef } from 'react';

const NAV = [
  { href: '/gameday',   label: 'Game Day'  },
  { href: '/my-team',   label: 'My Team'   },
  { href: '/dashboard', label: 'Scores'    },
  { href: '/rankings',  label: 'Rankings'  },
  { href: '/connect',   label: 'Leagues'   },
];

export default function NavLinks() {
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the mobile menu on navigation.
  useEffect(() => { setOpen(false); }, [pathname]);
  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Show nothing until Clerk resolves auth state (avoids flash)
  if (!isLoaded) {
    return <div className="w-24 h-8" />;
  }

  if (!isSignedIn) {
    return (
      <nav className="flex items-center gap-2 font-ui">
        <Link
          href="/sign-in"
          className="px-3 py-1.5 text-sm font-semibold text-gray-400 hover:text-white tracking-wider transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="px-3 py-1.5 text-sm font-bold bg-accent hover:bg-accent-soft text-pitch-950 rounded-lg tracking-wider transition-colors"
        >
          Get Started
        </Link>
      </nav>
    );
  }

  const isActive = (href: string) =>
    !!pathname && (pathname === href || (href !== '/' && pathname.startsWith(href)));

  return (
    <div className="relative flex items-center gap-1 font-ui" ref={ref}>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-0.5">
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`relative px-3.5 py-2 text-sm font-semibold tracking-wider transition-colors ${
              isActive(href) ? 'text-accent' : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
            {isActive(href) && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-accent" />
            )}
          </Link>
        ))}
      </nav>

      {/* Mobile hamburger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        aria-expanded={open}
        className="md:hidden p-2 rounded-lg border border-pitch-700 bg-pitch-900 hover:bg-pitch-800 transition-colors"
      >
        <svg className="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {/* Clerk user button — shows avatar with sign-out dropdown */}
      <div className="ml-1 md:ml-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
              userButtonPopoverCard: "bg-pitch-900 border border-pitch-700 shadow-2xl",
              userButtonPopoverActionButton: "hover:bg-pitch-800 text-white",
              userButtonPopoverActionButtonText: "text-white text-sm",
              userButtonPopoverFooter: "hidden",
            },
          }}
        />
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="md:hidden absolute right-0 top-full mt-2 w-52 rounded-xl border border-pitch-700 bg-pitch-900 shadow-2xl shadow-black/50 z-50 py-1.5">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm font-semibold tracking-wider transition-colors ${
                isActive(href) ? 'text-accent bg-pitch-800/50' : 'text-gray-300 hover:bg-pitch-800'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
