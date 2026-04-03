"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/gameday",   label: "Game Day"  },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rankings",  label: "Rankings"  },
  { href: "/connect",   label: "Leagues"   },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5 font-ui">
      {NAV.map(({ href, label }) => {
        const active = !!pathname && (pathname === href || (href !== "/" && pathname.startsWith(href)));
        return (
          <Link
            key={href}
            href={href}
            className={`relative px-3.5 py-2 text-sm font-semibold tracking-wider transition-colors ${
              active ? "text-amber-400" : "text-gray-400 hover:text-white"
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
  );
}
