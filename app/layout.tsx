import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { Bebas_Neue, Rajdhani } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import NavLinks from "@/components/NavLinks";
import ThemePicker from "@/components/ThemePicker";
import Logo from "@/components/Logo";
import { getUserTheme } from "@/lib/tokenStore/index";
import { accentVarsForTeam } from "@/lib/teamThemes";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

const rajdhani = Rajdhani({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? "https://leagueblitz.app"),
  title: "League Blitz",
  description: "All your Yahoo, Sleeper, and ESPN fantasy football leagues in one dashboard with live scoring, power rankings, and AI matchup analysis.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
  },
  verification: {
    google: "fDfnOyaB8RSgCodLItI_C1Q0yasUzwK1sx5B_jdaSww",
  },
};

export const viewport: Viewport = {
  themeColor: "#07080d",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Apply the user's NFL-team accent server-side (no flash). Default = amber.
  const { userId } = await auth();
  const team = userId ? await getUserTheme(userId) : null;
  const accentStyle = (accentVarsForTeam(team) ?? undefined) as unknown as React.CSSProperties | undefined;

  return (
    <ClerkProvider>
      <html lang="en" className={`${bebasNeue.variable} ${rajdhani.variable}`} style={accentStyle}>
        <body className="min-h-screen font-ui">
          {/* GA4 — production only, so dev/preview traffic never lands in analytics */}
          {process.env.VERCEL_ENV === "production" && (
            <>
              <Script
                src="https://www.googletagmanager.com/gtag/js?id=G-JPRSRG6SB5"
                strategy="afterInteractive"
              />
              <Script id="ga4-init" strategy="afterInteractive">
                {`window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', 'G-JPRSRG6SB5');`}
              </Script>
            </>
          )}
          <header className="sticky top-0 z-10 border-b border-pitch-700/80 bg-pitch-900/92 backdrop-blur-md">
            <div className="max-w-7xl mx-auto flex items-center justify-between py-2.5 px-6">
              {/* Logo (green follows the team accent; black shapes render white) */}
              <Link href="/" className="flex items-center hover:opacity-85 transition-opacity" aria-label="League Blitz home">
                <Logo className="h-16 md:h-20 w-auto text-accent" />
              </Link>

              <div className="flex items-center gap-3">
                <NavLinks />
                <ThemePicker currentTeam={team ?? null} />
              </div>
            </div>
          </header>

          <main className="relative z-[1] max-w-7xl mx-auto py-8 px-6">
            {children}
          </main>

          <footer className="relative z-[1] max-w-7xl mx-auto py-6 px-6 border-t border-pitch-700/40 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs tracking-widest text-gray-600 uppercase font-semibold">
              © {new Date().getFullYear()} League Blitz
            </span>
            <nav aria-label="Legal and support" className="flex items-center gap-4">
              <Link href="/privacy" className="text-xs tracking-widest text-gray-600 uppercase font-semibold hover:text-gray-400 transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="text-xs tracking-widest text-gray-600 uppercase font-semibold hover:text-gray-400 transition-colors">
                Terms
              </Link>
              <Link href="/support" className="text-xs tracking-widest text-gray-600 uppercase font-semibold hover:text-gray-400 transition-colors">
                Support
              </Link>
            </nav>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
