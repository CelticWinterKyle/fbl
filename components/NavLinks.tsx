'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, UserButton } from '@clerk/nextjs';

const NAV = [
  { href: '/gameday',   label: 'Game Day'  },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/rankings',  label: 'Rankings'  },
  { href: '/connect',   label: 'Leagues'   },
];

export default function NavLinks() {
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();

  // Show nothing until Clerk resolves auth state (avoids flash)
  if (!isLoaded) {
    return <div className="w-40 h-8" />;
  }

  if (!isSignedIn) {
    return (
      <nav className="flex items-center gap-2 font-ui">
        <Link
          href="/sign-in"
          className="px-4 py-1.5 text-sm font-semibold text-gray-400 hover:text-white tracking-wider transition-colors"
        >
          Sign In
        </Link>
        <Link
          href="/sign-up"
          className="px-4 py-1.5 text-sm font-bold bg-amber-400 hover:bg-amber-300 text-pitch-950 rounded-lg tracking-wider transition-colors"
        >
          Get Started
        </Link>
      </nav>
    );
  }

  return (
    <div className="flex items-center gap-1 font-ui">
      <nav className="flex items-center gap-0.5">
        {NAV.map(({ href, label }) => {
          const active = !!pathname && (pathname === href || (href !== '/' && pathname.startsWith(href)));
          return (
            <Link
              key={href}
              href={href}
              className={`relative px-3.5 py-2 text-sm font-semibold tracking-wider transition-colors ${
                active ? 'text-amber-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
              {active && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-amber-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Clerk user button — shows avatar with sign-out dropdown */}
      <div className="ml-3">
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
    </div>
  );
}
